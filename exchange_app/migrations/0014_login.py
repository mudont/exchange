# Generated by Django 2.2 on 2019-04-27 18:19

from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('exchange_app', '0013_auto_20190424_0044'),
    ]

    operations = [
        migrations.CreateModel(
            name='Login',
            fields=[
                ('user_id', models.CharField(max_length=64, primary_key=True, serialize=False)),
                ('nickname', models.CharField(max_length=64)),
                ('name', models.CharField(max_length=64)),
                ('email', models.CharField(max_length=255)),
                ('timestamp', models.DateTimeField(default=django.utils.timezone.now)),
            ],
            options={
                'unique_together': {('user_id', 'timestamp')},
            },
        ),
    ]
