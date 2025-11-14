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

        return JsonResponse({'status': 'success', 'rows': len(df), 'imported': imported})