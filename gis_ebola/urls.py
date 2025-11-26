"""
URL configuration for gis_ebola project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from django.views.decorators.csrf import csrf_exempt

from django.views.generic import TemplateView
from data_upload.views import GISDataView, UploadCSVView, GISAnalysisView, MapView, upload_csv, test_upload

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', TemplateView.as_view(template_name='index.html'), name='home'),
    path('upload/', TemplateView.as_view(template_name='upload.html'), name='upload'),
    # path('api/upload/', csrf_exempt(UploadCSVView.as_view()), name='api-upload'),
    path('api/gis/', GISDataView.as_view(), name='gis-data'),
    path('api/gis-analysis/', GISAnalysisView.as_view()),
    path('map/', MapView.as_view(), name='map'),
    path('upload-waiting/', TemplateView.as_view(template_name='upload_waiting.html'), name='upload-waiting'),
    
    path('api/upload/', csrf_exempt(upload_csv), name='api-upload'),


#===================below is the code for debugging upload issues, remove later=========================

    path('api/test-upload/', csrf_exempt(test_upload), name='test-upload'),
    path('test/', TemplateView.as_view(template_name='test_upload.html')),
]