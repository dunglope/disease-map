# NERGAL – Global Disease Interactive Dashboard

A Django-based web application for visualizing disease outbreak data on an interactive map with real-time statistics, community discussions, and dataset management.

## Tech Stack

**Backend**
- Django 5.2.8
- GeoDjango with PostGIS spatial database
- PostgreSQL 15+
- Pandas (CSV processing)
- GDAL/GEOS (geometry handling)

**Frontend**
- Leaflet.js 1.9.4
- Chart.js
- Bootstrap 5
- Vanilla JavaScript

**Database**
- PostgreSQL with PostGIS extension
- Simplified geometry storage for performance

## Installation

### Prerequisites
- Python 3.10+
- PostgreSQL 13+ with PostGIS

### Setup Instructions

1. **Clone the repository**
```bash
git clone https://github.com/dunglope/disease-map.git
cd gis_ebola
```

2. **Create and activate virtual environment**
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate
```

3. **Install dependencies**
```bash
pip install -r requirements.txt
```

4. **Configure database**
- Create PostgreSQL database:
```sql
createdb ebola_db
```

- Enable PostGIS:
```sql
CREATE EXTENSION postgis;
```

- Update database credentials in `gis_ebola/settings.py`

5. **Run migrations**
```bash
python manage.py makemigrations
python manage.py migrate
```

6. **Create superuser (optional, for admin panel)**
```bash
python manage.py createsuperuser
```

7. **Run development server**
```bash
python manage.py runserver
```

Access the application at `http://localhost:8000`

## Usage

### Upload Dataset

1. Navigate to `/upload/`
2. Select CSV file with disease data
3. Auto-detect or manually map columns:
   - Country (required)
   - Cases or Deaths (at least one required)
   - Date (optional, defaults to 2020-01-01)
4. Provide dataset name (e.g., "covid19", "ebola")
5. Click Upload

Supported CSV columns: country, cases, deaths, date, etc.

### View Map Dashboard

1. Go to `/map/`
2. Select dataset from dropdown
3. Use year slider to filter by year (2010-2025)
4. Click countries for details
5. Sort top 10 countries by cases or deaths

### Participate in Discussions

1. Navigate to `/discussion/`
2. Enter a display name
3. View dataset-specific conversation threads
4. Click ↩️ on any message to reply
5. Messages auto-refresh every 4 seconds

## API Endpoints

```
GET  /api/gis-stats/          - Get stats, charts, and GeoJSON for map
     ?dataset=<name>&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&sort=cases|deaths

GET  /api/datasets/           - List all available datasets

POST /api/upload/             - Upload CSV dataset
     Parameters: csv_file, dataset_name, country_col, date_col, cases_col, deaths_col

POST /api/detect-columns/     - Auto-detect CSV columns
     Parameters: csv_file

POST /api/post-message/       - Post discussion message
     Parameters: message, dataset, reply_to (optional)
```

## Database Schema

### DiseaseData
```
- id: Primary Key
- dataset_type: CharField (disease name)
- date: DateField
- country: CharField (indexed)
- cases: IntegerField (nullable)
- deaths: IntegerField (nullable)
- geom: MultiPolygonField (spatial geometry)
```

### DiscussionMessage
```
- id: Primary Key
- display_name: CharField (indexed)
- dataset_type: CharField (indexed, for dataset filtering)
- message: TextField
- reply_to: ForeignKey (self-referencing for threaded replies)
- created_at: DateTimeField (auto-created)
```

## File Structure

```
gis_ebola/
├── README.md
├── .gitignore
├── manage.py
├── db.sqlite3
├── gis_ebola/              # Project configuration
│   ├── settings.py
│   ├── urls.py
│   ├── wsgi.py
│   └── asgi.py
├── data_upload/            # Main app
│   ├── models.py           # DiseaseData, DiscussionMessage
│   ├── views.py            # API views
│   ├── admin.py
│   ├── urls.py
│   ├── migrations/
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css
│   │   └── js/
│   │       ├── map.js
│   │       ├── discussion.js
│   │       └── upload.js
│   └── templates/
│       ├── base.html
│       ├── map.html
│       ├── discussion.html
│       ├── discussion_name.html
│       ├── index.html
│       └── upload.html
└── requirements.txt
```

## Configuration

Key settings in `gis_ebola/settings.py`:

```python
# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.contrib.gis.db.backends.postgis',
        'NAME': 'ebola_db',
        'USER': 'postgres',
        'PASSWORD': 'your_password',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}

# Upload limits (currently 5GB)
DATA_UPLOAD_MAX_MEMORY_SIZE = 5242880000
FILE_UPLOAD_MAX_MEMORY_SIZE = 5242880000
```

## Development

### Running Tests
```bash
python manage.py test
```

### Debugging
- Set `DEBUG = True` in settings.py
- Check terminal output for detailed error messages
- Browser console for frontend errors

## Deployment

For production deployment:

1. Set `DEBUG = False` in settings.py
2. Update `ALLOWED_HOSTS` with domain names
3. Use environment variables for sensitive data (.env)
4. Configure HTTPS/SSL
5. Use Gunicorn/uWSGI with Nginx reverse proxy
6. Enable database connection pooling (PgBouncer)

## Contributing

1. Create feature branch: `git checkout -b feature/your-feature`
2. Commit changes: `git commit -am 'Add feature'`
3. Push to branch: `git push origin feature/your-feature`
4. Open Pull Request

## License

MIT License - see LICENSE file for details

## Contact

- GitHub: [@dunglope](https://github.com/dunglope)
- Email: dunglope@gmail.com
