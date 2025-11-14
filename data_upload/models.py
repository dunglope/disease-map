from django.contrib.gis.db import models

class DiseaseData(models.Model):
    dataset_type = models.CharField(max_length=50)
    date = models.DateField()
    country = models.CharField(max_length=100)
    cases = models.IntegerField(null=True)
    deaths = models.IntegerField(null=True)
    geom = models.MultiPolygonField(null=True)
    
    