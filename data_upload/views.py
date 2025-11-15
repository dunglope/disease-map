from django.views import View
from django.http import JsonResponse
from django.db import connection
import pandas as pd
from .models import DiseaseData
from django.contrib.gis.db.models import Sum
import json
from django.db.models import Q, Sum
from django.contrib.gis.db.models.functions import Area
from django.db.models.functions import ExtractYear
from django.http import JsonResponse

class UploadCSVView(View):
    
    def _lookup_geom(self, country):
        with connection.cursor() as cursor:
            cursor.execute("SELECT geom FROM world_countries WHERE admin = %s", [country])
            row = cursor.fetchone()
            if row:
                return row[0]
            else:
                return None

    def post(self, request):
        file = request.FILES['csv_file']
        df = pd.read_csv(file)
        
        col_map = {     # I smell SQL injection here, but who cares?
        'date':   next((c for c in df.columns if c.lower() in ['date', 'year', 'time', 'period']), None),
        'country': next((c for c in df.columns if c.lower() in ['country', 'location', 'area', 'region']), None),
        'value':  next((c for c in df.columns if c.lower() in ['value', 'cases', 'deaths', 'count', 'cumulative']), None),
        'indicator': next((c for c in df.columns if c.lower() in ['indicator', 'disease', 'type', 'metric']), None),
        #'dataset': next((c for c in df.columns if c.lower() in ['dataset', 'source', 'disease_name']), None),    # Maybe let user specify dataset name?
    }
        
        if not col_map['country'] or not col_map['value']:
            return JsonResponse({'error': 'CSV must have country and value columns'}, status=400)
        
        if col_map['date']:
            df['parsed_date'] = pd.to_datetime(df[col_map['date']], errors='coerce')
        else:
            df['parsed_date'] = pd.Timestamp.today()
            
        df = df.dropna(subset=['parsed_date', col_map['country'], col_map['value']])
        df = df[df['parsed_date'].notna()]
        
        imported = 0
        for _, row in df.iterrows():
            geom = self._lookup_geom(row[col_map['country']])

            DiseaseData.objects.create(
                dataset_type="ebola",   # This shit is hardcoded, only for now
                date=row['parsed_date'].date(),
                country=row[col_map['country']],
                cases=int(float(row[col_map['value']])),
                geom=geom,
            )
            imported += 1

        return JsonResponse({'status': 'success', 'rows': len(df), 'imported': imported})   # last time upload: 12m4s for 17585 rows
    
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

        # Step 1: Aggregate cases by country + year
        agg = DiseaseData.objects.filter(filters) \
            .values('country') \
            .annotate(
                year=ExtractYear('date'),
                total_cases=Sum('cases')
            )

        features = []
        for row in agg:
            # Step 2: Get geom once per country
            geom_obj = DiseaseData.objects.filter(country=row['country']).first()
            if not geom_obj or not geom_obj.geom:
                continue

            # Step 3: Calculate area in Python (in square degrees → approx)
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