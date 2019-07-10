# Generated by Django 2.2 on 2019-04-22 23:45

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('exchange_app', '0011_auto_20190422_2343'),
    ]

    operations = [
        migrations.AlterField(
            model_name='instrument',
            name='allowed_bidders',
            field=models.ForeignKey(default=None, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='instruments_on_which_we_can_bid', to='auth.Group'),
        ),
        migrations.AlterField(
            model_name='instrument',
            name='allowed_offerers',
            field=models.ForeignKey(default=None, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='instruments_on_which_we_can_offer', to='auth.Group'),
        ),
    ]
