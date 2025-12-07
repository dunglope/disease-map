from django.contrib.gis.db import models

class DiseaseData(models.Model):
    dataset_type = models.CharField(max_length=50)
    date = models.DateField()
    country = models.CharField(max_length=100)
    cases = models.IntegerField(null=True)
    deaths = models.IntegerField(null=True)
    geom = models.MultiPolygonField(null=True)
    
class DiscussionMessage(models.Model):
    display_name = models.CharField(max_length=50, db_index=True)
    dataset_type = models.CharField(max_length=50, default='general', db_index=True)
    message = models.TextField()
    reply_to = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='replies')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['display_name']),
            models.Index(fields=['dataset_type']),
        ]

    def __str__(self):
        return f"{self.display_name}: {self.message[:30]}"