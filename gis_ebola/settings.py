from pathlib import Path

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


SECRET_KEY = 'django-insecure-5e*08dvj5)^tu=4uru!n0@qb8$m*6ged0ytycehprx+dwtjx#1'
DEBUG = True

ALLOWED_HOSTS = [
    "away-sphereless-scarlette.ngrok-free.dev",
    "localhost",
    "127.0.0.1:8000",
]


INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'data_upload',
    'django.contrib.gis',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'gis_ebola.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / "data_upload" / "templates"],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'gis_ebola.wsgi.application'


DATABASES = {
    'default': {
        'ENGINE': 'django.contrib.gis.db.backends.postgis',
        'NAME': 'ebola_db',
        'USER': 'postgres',
        'PASSWORD': 'Dung.io2',
        'HOST': 'localhost',
        'PORT': '5432',
        'CONN_MAX_AGE': 0,  # Don't reuse connections (prevents stale connections after crashes)
        'AUTOCOMMIT': True,  # Commit each query immediately
        'OPTIONS': {
            'connect_timeout': 30,  # Increase connection timeout
            'keepalives': 1,
            'keepalives_idle': 60,
        }
    }
}


AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


STATIC_URL = '/data_upload/static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

GDAL_LIBRARY_PATH = r"C:\Users\Admin\AppData\Roaming\Python\Python312\site-packages\osgeo\gdal.dll"
GEOS_LIBRARY_PATH = r"C:\Users\Admin\AppData\Roaming\Python\Python312\site-packages\osgeo\geos_c.dll"

DATA_UPLOAD_MAX_MEMORY_SIZE = 5242880000
FILE_UPLOAD_MAX_MEMORY_SIZE = 5242880000
DATA_UPLOAD_MAX_NUMBER_FIELDS = 20000


