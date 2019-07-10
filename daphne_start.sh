#!/bin/bash
export PATH=/home/murali/anaconda3/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games

NAME="exchange"
DJANGODIR=$(dirname $0)
SOCKFILE=/var/www/mariandrive.com/run/exchange.sock
USER=murali
GROUP=murali
NUM_WORKERS=1
DJANGO_ASGI_MODULE=exchange.asgi
DJANGO_SETTINGS_MODULE=exchange.settings

echo "Starting $NAME as `whoami`"

# Activate the virtual environment
cd $DJANGODIR
export DJANGO_SETTINGS_MODULE=$DJANGO_SETTINGS_MODULE
#export PYTHONPATH=$DJANGODIR:$PYTHONPATH

# Create the run directory if it doesn't exist
RUNDIR=$(dirname $SOCKFILE)
test -d $RUNDIR || mkdir -p $RUNDIR

# Start your Django Unicorn
# Programs meant to be run under supervisor should not daemonize themselves (do not use --daemon)
exec pipenv run daphne -u $SOCKFILE ${DJANGO_ASGI_MODULE}:application \
