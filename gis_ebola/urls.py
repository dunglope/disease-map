from django.contrib import admin
from django.urls import path
from django.views.decorators.csrf import csrf_exempt
from django.views.generic import TemplateView
from data_upload.views import MapView, upload_csv, detect_csv_columns, GISStatsView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', TemplateView.as_view(template_name='index.html'), name='home'),
    path('upload/', TemplateView.as_view(template_name='upload.html'), name='upload'),
    path('map/', MapView.as_view(), name='map'),
    path('api/upload/', csrf_exempt(upload_csv), name='api-upload'),
    path('api/detect-columns/', csrf_exempt(detect_csv_columns), name='detect-columns'),
    path('api/gis-stats/', GISStatsView.as_view()),
]
