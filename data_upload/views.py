import time
from django.views import View
from django.http import JsonResponse, StreamingHttpResponse
from django.db import connection
import pandas as pd
from .models import DiseaseData
from django.contrib.gis.db.models import Sum
import json
from django.db.models import Q, Sum
from django.contrib.gis.db.models.functions import Area
from django.db.models.functions import ExtractYear
from django.http import JsonResponse
from django.shortcuts import render
from django.contrib.gis.geos import GEOSGeometry

class UploadCSVView(View):
    EMPTY_GEOM = GEOSGeometry('MULTIPOLYGON EMPTY', srid=4326)
    
    def _lookup_geom(self, country_name: str):
        """
        Return a GEOSGeometry (MultiPolygon) for *country_name*.
        Falls back to MULTIPOLYGON EMPTY if not found.
        """
        sql = """
            SELECT ST_AsText(geom)
            FROM world_countries
            WHERE lower(name) = lower(%s)
               OR lower(name_en) = lower(%s)
               OR lower(adm0_a3) = lower(%s)
            LIMIT 1;
        """
        with connection.cursor() as cur:
            cur.execute(sql, [country_name, country_name, country_name])
            row = cur.fetchone()
            if row and row[0]:
                return GEOSGeometry(row[0], srid=4326)
        return GEOSGeometry('MULTIPOLYGON EMPTY', srid=4326)

    def post(self, request):
        file = request.FILES.get('csv_file')
        dataset_name = request.POST.get('dataset_name', 'unknown').strip()
        
        if not file or not dataset_name:
            return JsonResponse({'error': 'Missing file or dataset name'}, status=400)
        
        def event_stream():
            yield f"data: {json.dumps({'status': 'reading', 'message': 'Reading CSV file...'})}\n\n"
            time.sleep(0.5)

            try:
                df = pd.read_csv(file)
                total_rows = len(df)
                yield f"data: {json.dumps({'status': 'parsing', 'progress': 20, 'total': total_rows})}\n\n"
                
                col_map = {
                    'date':   next((c for c in df.columns if c.lower() in ['date', 'year', 'time', 'period']), None),
                    'country': next((c for c in df.columns if c.lower() in ['country', 'location', 'area', 'region']), None),
                    'value':  next((c for c in df.columns if c.lower() in ['value', 'cases', 'deaths', 'count', 'cumulative']), None),
                    'indicator': next((c for c in df.columns if c.lower() in ['indicator', 'disease', 'type', 'metric']), None),
                }
                
                if not col_map['country'] or not col_map['value']:
                    yield f"data: {json.dumps({'error': 'CSV must have country and value columns'})}\n\n"
                    return

                yield f"data: {json.dumps({'status': 'matching', 'message': 'Matching countries to geometry...'})}\n\n"
                time.sleep(0.8)

                # Parse dates
                if col_map['date']:
                    df['parsed_date'] = pd.to_datetime(df[col_map['date']], errors='coerce')
                else:
                    df['parsed_date'] = pd.Timestamp.today()

                df = df.dropna(subset=['parsed_date', col_map['country'], col_map['value']])
                
                yield f"data: {json.dumps({'status': 'saving', 'message': 'Saving to database...'})}\n\n"

                imported = 0
                for _, row in df.iterrows():
                    geom = self._lookup_geom(row[col_map['country']])
                    DiseaseData.objects.create(
                        dataset_type=dataset_name,
                        date=row['parsed_date'].date(),
                        country=row[col_map['country']],
                        cases=int(float(row[col_map['value']])),
                        geom=geom,
                    )
                    imported += 1
                    progress = min(95, 30 + (imported / total_rows) * 60)
                    yield f"data: {json.dumps({'progress': int(progress), 'imported': imported})}\n\n"
                    time.sleep(0.01)  # Small delay for streaming feel

                yield f"data: {json.dumps({'status': 'complete', 'progress': 100, 'imported': imported, 'dataset': dataset_name})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        response = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response
    
        # ==========The code below is for better performance (upload faster) but I don't have time to fix it yet (nvm it's gone)==========
        
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
    
def upload_csv(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method Not Allowed'}, status=405)

    file = request.FILES.get('csv_file')
    dataset_name = request.POST.get('dataset_name', '').strip()

    if not file or not dataset_name:
        return JsonResponse({'error': 'Missing file or dataset name'}, status=400)

    try:
        df = pd.read_csv(file)

        # Auto-detect columns
        country_col = next((c for c in df.columns if 'country' in c.lower()), None)
        value_col = next((c for c in df.columns if any(x in c.lower() for x in ['case', 'death', 'value', 'cumulative'])), None)
        date_col = next((c for c in df.columns if any(x in c.lower() for x in ['date', 'year', 'time'])), None)

        if not country_col or not value_col:
            return JsonResponse({'error': 'CSV must contain country and cases/deaths column'}, status=400)

        imported = 0
        total = len(df)

        for _, row in df.iterrows():
            country = str(row[country_col]).strip()
            try:
                cases = int(float(row[value_col]))
            except:
                cases = 0

            date_val = pd.to_datetime(row[date_col], errors='coerce') if date_col and pd.notna(row[date_col]) else pd.Timestamp('2020-01-01')
            if pd.isna(date_val):
                date_val = pd.Timestamp('2020-01-01')

            # Get geometry
            with connection.cursor() as cur:
                cur.execute("""
                    SELECT geom FROM world_countries 
                    WHERE lower(name) = lower(%s) 
                       OR lower(name_en) = lower(%s) 
                       OR lower(adm0_a3) = lower(%s)
                    LIMIT 1
                """, [country, country, country])
                geom_row = cur.fetchone()

            geom = GEOSGeometry(geom_row[0], srid=4326) if geom_row else GEOSGeometry('MULTIPOLYGON EMPTY', srid=4326)

            # Create one by one — no bulk_create!
            DiseaseData.objects.create(
                dataset_type=dataset_name,
                date=date_val.date(),
                country=country,
                cases=cases,
                geom=geom
            )
            imported += 1

        return JsonResponse({
            'status': 'success',
            'imported': imported,
            'dataset': dataset_name
        })

    except Exception as e:
        return JsonResponse({'error': f'Upload failed: {str(e)}'}, status=500)