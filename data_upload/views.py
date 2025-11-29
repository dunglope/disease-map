import time
import json
import logging
import pandas as pd
from django.views import View
from django.http import JsonResponse
from django.db import connection
from django.shortcuts import render
from django.contrib.gis.geos import GEOSGeometry, MultiPolygon
from django.db.models import Q, Sum
from django.db.models.functions import ExtractYear
from .models import DiseaseData

logger = logging.getLogger(__name__)
        
class GISDataView(View):
    def get(self, request):
        dataset = request.GET.get('dataset', 'ebola')
        start = request.GET.get('start_date')
        end = request.GET.get('end_date')
        country = request.GET.get('country')

        queryset = DiseaseData.objects.filter(dataset_type=dataset)
        if start: queryset = queryset.filter(date__gte=start)
        if end:   queryset = queryset.filter(date__lte=end)
        if country: queryset = queryset.filter(country__iexact=country)

        data = queryset.values('country').annotate(total_cases=Sum('cases'))
        
        features = []
        for row in data:
            geom = DiseaseData.objects.filter(country=row['country']).first().geom
            if geom:
                feature = {
                    "type": "Feature",
                    "geometry": json.loads(geom.geojson),
                    "properties": {
                        "country": row['country'],
                        "cases": row['total_cases']
                    }
                }
                features.append(feature)

        geojson = {
            "type": "FeatureCollection",
            "features": features
        }
        return JsonResponse(geojson)
    
class GISAnalysisView(View):
    def get(self, request):
        filters = Q()
        if ds := request.GET.get('dataset'): 
            filters &= Q(dataset_type__in=ds.split(','))
        if start := request.GET.get('start_date'): 
            filters &= Q(date__gte=start)
        if end := request.GET.get('end_date'): 
            filters &= Q(date__lte=end)
        if country := request.GET.get('country'): 
            filters &= Q(country__iexact=country)

        agg = DiseaseData.objects.filter(filters) \
            .values('country') \
            .annotate(
                year=ExtractYear('date'),
                total_cases=Sum('cases')
            )

        features = []
        for row in agg:
            geom_obj = DiseaseData.objects.filter(country=row['country']).first()
            if not geom_obj or not geom_obj.geom:
                continue

            area_sq_deg = geom_obj.geom.area  # PostGIS area in SRID units (4326 → degrees)

            density = row['total_cases'] / area_sq_deg if area_sq_deg > 0 else 0

            features.append({
                "type": "Feature",
                "geometry": json.loads(geom_obj.geom.geojson),
                "properties": {
                    "country": row['country'],
                    "year": row['year'],
                    "cases": row['total_cases'],
                    "density": round(density, 8)
                }
            })

        return JsonResponse({"type": "FeatureCollection", "features": features})
    
class MapView(View):
    def get(self, request):
        return render(request, 'map.html')


def detect_csv_columns(request):
    """
    Detect available columns in uploaded CSV
    Returns: {"columns": ["col1", "col2", ...], "sample_data": {...}}
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method Not Allowed'}, status=405)
    
    file = request.FILES.get('csv_file')
    if not file:
        return JsonResponse({'error': 'No file provided'}, status=400)
    
    try:
        df = pd.read_csv(file, encoding='utf-8', low_memory=False, nrows=100)
        columns = list(df.columns)
        
        # Get sample data - return up to 3 non-null values per column
        sample_data = {}
        for col in columns:
            non_null = df[col].dropna()
            if len(non_null) > 0:
                # Convert to list of up to 3 samples, converted to strings
                samples = [str(v).strip() for v in non_null.head(3).tolist()]
                sample_data[col] = samples
            else:
                sample_data[col] = []
        
        logger.info(f"📋 Detected {len(columns)} columns: {columns}")
        logger.info(f"📊 Sample data: {sample_data}")
        
        return JsonResponse({
            'status': 'success',
            'columns': columns,
            'sample_data': sample_data,
            'total_rows': len(df)
        })
    except Exception as e:
        logger.error(f"Error detecting columns: {e}")
        return JsonResponse({'error': f'Failed to read CSV: {str(e)}'}, status=400)
    


def upload_csv(request):
    """
    ⚡ ROBUST synchronous upload with crash-safe geometry fetching
    - Accepts manual column mapping from user
    - Fetches geometries ONE at a time (safest for server stability)
    - Small batch inserts (1000 records) for memory safety
    - Safe for files with 100k+ rows
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method Not Allowed'}, status=405)

    file = request.FILES.get('csv_file')
    dataset_name = request.POST.get('dataset_name', '').strip()
    
    # Get column mappings from user (or use auto-detect)
    country_col = request.POST.get('country_col', '').strip()
    date_col = request.POST.get('date_col', '').strip()
    cases_col = request.POST.get('cases_col', '').strip()
    deaths_col = request.POST.get('deaths_col', '').strip()

    if not file or not dataset_name:
        return JsonResponse({'error': 'Missing file or dataset name'}, status=400)

    try:
        start_time = time.time()
        
        # 1️⃣ READ CSV
        df = pd.read_csv(file, encoding='utf-8', low_memory=False)
        total_rows = len(df)
        logger.info(f"📥 Read {total_rows} rows from {file.name}")
        
        # 2️⃣ VALIDATE COLUMNS
        # If user provided manual mappings, use those. Otherwise auto-detect
        if not country_col:
            country_col = next((c for c in df.columns if 'country' in c.lower()), None)
        if not date_col:
            date_col = next((c for c in df.columns if any(x in c.lower() for x in ['date', 'year', 'time', 'period'])), None)
        
        # Detect cases and deaths columns separately
        if not cases_col:
            cases_col = next((c for c in df.columns if any(x in c.lower() for x in ['case', 'cases', 'confirmed', 'total', 'count'])), None)
        if not deaths_col:
            deaths_col = next((c for c in df.columns if any(x in c.lower() for x in ['death', 'deaths', 'died', 'mortality', 'fatal'])), None)

        if not country_col or (not cases_col and not deaths_col):
            return JsonResponse({'error': 'CSV must contain country and cases/deaths columns'}, status=400)

        # DEBUG: Log detected/provided columns
        logger.info(f"📋 Using columns: country='{country_col}', cases='{cases_col}', deaths='{deaths_col}', date='{date_col}'")
        if cases_col:
            logger.info(f"📊 Sample values from {cases_col}: {df[cases_col].head(3).tolist()}")
        if deaths_col:
            logger.info(f"📊 Sample values from {deaths_col}: {df[deaths_col].head(3).tolist()}")

        # 3️⃣ PRE-FETCH GEOMETRIES - SIMPLIFIED & SAFE
        unique_countries = df[country_col].dropna().unique()
        geometry_cache = {}
        empty_geom = GEOSGeometry('MULTIPOLYGON EMPTY', srid=4326)
        
        logger.info(f"🌍 Fetching {len(unique_countries)} unique country geometries (simplified)...")
        
        countries_to_fetch = list(set([str(c).strip().lower() for c in unique_countries]))
        
        # Fetch each country individually with SIMPLIFIED geometry
        # ST_SimplifyPreserveTopology reduces geometry size by 90%+
        for idx, country_key in enumerate(countries_to_fetch):
            try:
                with connection.cursor() as cur:
                    # Use simplified geometry to prevent memory crashes
                    # Tolerance 0.01 degrees = ~1km, good enough for visualization
                    cur.execute("""
                        SELECT ST_AsText(ST_SimplifyPreserveTopology(geom, 0.01))
                        FROM world_countries 
                        WHERE lower(name) = %s LIMIT 1
                    """, [country_key])
                    
                    row = cur.fetchone()
                    
                    # Fallback to name_en or adm0_a3
                    if not row:
                        cur.execute("""
                            SELECT ST_AsText(ST_SimplifyPreserveTopology(geom, 0.01))
                            FROM world_countries 
                            WHERE lower(name_en) = %s OR lower(adm0_a3) = %s LIMIT 1
                        """, [country_key, country_key])
                        row = cur.fetchone()
                    
                    if row and row[0]:
                        try:
                            geom = GEOSGeometry(row[0], srid=4326)
                            # Convert Polygon to MultiPolygon if needed
                            if geom.geom_type == 'Polygon':
                                geom = MultiPolygon(geom, srid=4326)
                            geometry_cache[country_key] = geom
                        except Exception as geom_err:
                            logger.warning(f"⚠️ Skipping invalid geometry for {country_key}")
                            geometry_cache[country_key] = empty_geom
                    else:
                        geometry_cache[country_key] = empty_geom
                
                # Progress logging every 10 countries
                if (idx + 1) % 10 == 0:
                    logger.info(f"   Progress: {idx + 1}/{len(countries_to_fetch)} countries...")
                    
            except Exception as fetch_err:
                logger.error(f"⚠️ Fetch error for '{country_key}': {fetch_err}")
                geometry_cache[country_key] = empty_geom
                continue
        
        logger.info(f"✅ Cached {len(geometry_cache)} geometries (simplified to prevent crashes)")

        # 4️⃣ PREPARE RECORDS
        records_to_create = []
        skipped = 0
        
        country_idx = df.columns.get_loc(country_col)
        cases_idx = df.columns.get_loc(cases_col) if cases_col else None
        deaths_idx = df.columns.get_loc(deaths_col) if deaths_col else None
        date_idx = df.columns.get_loc(date_col) if date_col else None
        default_date = pd.Timestamp('2020-01-01').date()

        for row in df.itertuples(index=False):
            raw_country = row[country_idx] if country_idx < len(row) else None
            
            if pd.isna(raw_country):
                skipped += 1
                continue
                
            country_clean = str(raw_country).strip()
            country_key = country_clean.lower()
            
            # Parse cases value
            cases = None
            if cases_idx is not None and cases_idx < len(row):
                raw_cases = row[cases_idx]
                try:
                    if isinstance(raw_cases, str):
                        raw_cases = raw_cases.replace(',', '')
                    if pd.notna(raw_cases) and raw_cases != '':
                        cases = int(float(raw_cases))
                except (ValueError, TypeError) as parse_err:
                    logger.debug(f"Could not parse cases '{raw_cases}' for {country_clean}: {parse_err}")
                    cases = None

            # Parse deaths value
            deaths = None
            if deaths_idx is not None and deaths_idx < len(row):
                raw_deaths = row[deaths_idx]
                try:
                    if isinstance(raw_deaths, str):
                        raw_deaths = raw_deaths.replace(',', '')
                    if pd.notna(raw_deaths) and raw_deaths != '':
                        deaths = int(float(raw_deaths))
                except (ValueError, TypeError) as parse_err:
                    logger.debug(f"Could not parse deaths '{raw_deaths}' for {country_clean}: {parse_err}")
                    deaths = None

            if date_idx and date_idx < len(row):
                raw_date = row[date_idx]
                try:
                    dt = pd.to_datetime(raw_date, errors='coerce')
                    date_val = dt.date() if pd.notna(dt) else default_date
                except:
                    date_val = default_date
            else:
                date_val = default_date

            geom = geometry_cache.get(country_key, empty_geom)

            records_to_create.append(
                DiseaseData(
                    dataset_type=dataset_name,
                    date=date_val,
                    country=country_clean,
                    cases=cases,
                    deaths=deaths,
                    geom=geom
                )
            )

        logger.info(f"📊 Prepared {len(records_to_create)} records ({skipped} skipped)")

        # 5️⃣ BULK INSERT - VERY SMALL BATCHES FOR STABILITY
        if records_to_create:
            # Insert in small batches of 1000 to avoid overwhelming server
            for i in range(0, len(records_to_create), 1000):
                batch = records_to_create[i:i+1000]
                try:
                    DiseaseData.objects.bulk_create(batch, batch_size=1000)
                    logger.info(f"   Inserted {min(i+1000, len(records_to_create))}/{len(records_to_create)} records...")
                except Exception as insert_err:
                    logger.error(f"❌ Batch insert error at row {i}: {insert_err}")
                    raise

        elapsed = time.time() - start_time
        rows_per_sec = len(records_to_create) / elapsed if elapsed > 0 else 0
        logger.info(f"✨ Upload complete! {len(records_to_create)} rows in {elapsed:.2f}s ({rows_per_sec:.0f} rows/sec)")

        return JsonResponse({
            'status': 'success',
            'imported': len(records_to_create),
            'total_rows': total_rows,
            'skipped': skipped,
            'dataset': dataset_name,
            'elapsed_seconds': round(elapsed, 2)
        })

    except Exception as e:
        logger.error(f"❌ Upload failed: {e}", exc_info=True)
        connection.close()
        return JsonResponse({'error': f'Upload failed: {str(e)}'}, status=500)