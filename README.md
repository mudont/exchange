# exchange
Trading/Betting exchange

For Cricket world cup
=======
- Django/Python on backend
- Password-free login with [auth0](auth0.com)
- Soon
  - [Hasura](https://hasura.io/) graphql server
  - React/Typescript frontend coming

## Development prerequisites (backend)
- postgres
- redis
- python 3 (anaconda distribution recommended)
- pipenv
- django
- channels

## pipDeveloper instructions

- Open a terminal
- Clone the repo (one time) 
- cd to the toplevel directory ('cd ~/exchange' if you installed in home directory)
```
cd ~/exchange

# First time
pipenv install

pipenv shell

# First time
./manage.py makemigrations
./manage.py migrate

./manage.py  runserver
```

That should output something like ```...development server at http://127.0.0.1:8000```

use your browser to visit http://127.0.0.1:8000/admin/


# Running the App in production

At awani.org, nginx and gunicorn are used. 

```/etc/nginx/sites-available/awani.org``` points to UNIX socket in ```/var/www/awani.org/run/gunicorn.sock```

The script gunicorn_start.sh in top dir of this repo, cloned to
```/home/murali/exchange```, is invoked by Ubuntu service gunicorn_awani (```/lib/systemd/system/gunicorn_awani.service```)

Public URL is https://awani.org

