# Generated by Django 2.2 on 2019-05-05 15:12

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('exchange_app', '0018_login_socialaccount'),
    ]

    operations = [
        migrations.AddField(
            model_name='trader',
            name='credit_limit',
            field=models.FloatField(default=0.99),
        ),
    ]
