from django.views import View
from django.http import JsonResponse
from django.db import connection
from django.contrib.gis.geos import GEOSGeometry
import pandas as pd
from django.db import transaction as Transaction
from django.contrib.gis.db.models import MultiPolygonField
from django.contrib.gis.db import models 
from .models import DiseaseData

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
            WHERE lower(admin) = lower(%s)
            LIMIT 1;
        """
        with connection.cursor() as cur:
            cur.execute(sql, [country_name])
            row = cur.fetchone()
            if row and row[0]:
                return GEOSGeometry(row[0], srid=4326)
        # RETURN A REAL EMPTY MULTIPOLYGON, NOT STRING
        return GEOSGeometry('MULTIPOLYGON EMPTY', srid=4326)

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
        
        
        
       