# Generated by Django 2.2 on 2019-04-14 23:37

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('auth', '0011_update_proxy_permissions'),
        ('exchange_app', '0003_auto_20190414_2136'),
    ]

    operations = [
        migrations.CreateModel(
            name='Account',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.TextField()),
            ],
        ),
        migrations.CreateModel(
            name='InstrumentType',
            fields=[
                ('abbrev', models.CharField(max_length=32, primary_key=True, serialize=False)),
                ('name', models.TextField()),
            ],
        ),
        migrations.CreateModel(
            name='OrderStatus',
            fields=[
                ('abbrev', models.CharField(max_length=32, primary_key=True, serialize=False)),
                ('name', models.TextField()),
            ],
        ),
        migrations.CreateModel(
            name='OrderType',
            fields=[
                ('abbrev', models.CharField(max_length=32, primary_key=True, serialize=False)),
                ('name', models.TextField()),
            ],
        ),
        migrations.CreateModel(
            name='Organization',
            fields=[
                ('abbrev', models.CharField(max_length=32, primary_key=True, serialize=False)),
                ('name', models.TextField()),
            ],
        ),
        migrations.CreateModel(
            name='Trader',
            fields=[
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, primary_key=True, serialize=False, to=settings.AUTH_USER_MODEL)),
                ('org', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='exchange_app.Organization')),
            ],
        ),
        migrations.AddField(
            model_name='instrument',
            name='begin_time',
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
        migrations.AddField(
            model_name='instrument',
            name='expiration',
            field=models.DateTimeField(null=True),
        ),
        migrations.AddField(
            model_name='instrument',
            name='max_price',
            field=models.FloatField(default=100),
        ),
        migrations.AddField(
            model_name='instrument',
            name='min_price',
            field=models.FloatField(default=0),
        ),
        migrations.AddField(
            model_name='instrument',
            name='owner',
            field=models.ForeignKey(default=0, on_delete=django.db.models.deletion.PROTECT, to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='instrument',
            name='price_incr',
            field=models.FloatField(default=1),
        ),
        migrations.AddField(
            model_name='instrument',
            name='price_mult',
            field=models.FloatField(default=1),
        ),
        migrations.AddField(
            model_name='instrument',
            name='price_unit',
            field=models.ForeignKey(default=0, on_delete=django.db.models.deletion.PROTECT, related_name='instrument_price', to='exchange_app.Unit'),
        ),
        migrations.AddField(
            model_name='instrument',
            name='qty_incr',
            field=models.FloatField(default=1),
        ),
        migrations.AddField(
            model_name='instrument',
            name='qty_mult',
            field=models.FloatField(default=1),
        ),
        migrations.AddField(
            model_name='instrument',
            name='qty_unit',
            field=models.ForeignKey(default=0, on_delete=django.db.models.deletion.PROTECT, related_name='instrument_qty', to='exchange_app.Unit'),
        ),
        migrations.AlterField(
            model_name='currency',
            name='name',
            field=models.TextField(),
        ),
        migrations.AlterField(
            model_name='instrument',
            name='currency',
            field=models.ForeignKey(default=0, on_delete=django.db.models.deletion.PROTECT, to='exchange_app.Currency'),
        ),
        migrations.AlterField(
            model_name='instrument',
            name='name',
            field=models.TextField(),
        ),
        migrations.AlterField(
            model_name='unit',
            name='name',
            field=models.TextField(),
        ),
        migrations.CreateModel(
            name='TraderPermission',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('permission', models.CharField(max_length=10)),
                ('org', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='exchange_app.Organization')),
                ('trader', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='exchange_app.Trader')),
            ],
        ),
        migrations.CreateModel(
            name='Trade',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity', models.DecimalField(decimal_places=4, max_digits=12)),
                ('price', models.DecimalField(decimal_places=4, max_digits=12)),
                ('is_buyer_taker', models.BooleanField()),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('buyer', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='buy_trades', to='exchange_app.Trader')),
                ('instrument', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='exchange_app.Instrument')),
                ('seller', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='sell_trades', to='exchange_app.Trader')),
            ],
        ),
        migrations.CreateModel(
            name='Order',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('begin_time', models.DateTimeField(default=django.utils.timezone.now)),
                ('expiration', models.DateTimeField(default=django.utils.timezone.now)),
                ('is_buy', models.BooleanField()),
                ('quantity', models.DecimalField(decimal_places=4, max_digits=12)),
                ('limit_price', models.DecimalField(decimal_places=4, max_digits=12)),
                ('filled_quantity', models.DecimalField(decimal_places=4, max_digits=12)),
                ('account', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='exchange_app.Account')),
                ('instrument', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='exchange_app.Instrument')),
                ('status', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='exchange_app.OrderStatus')),
                ('trader', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='exchange_app.Trader')),
                ('type', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='exchange_app.OrderType')),
            ],
        ),
        migrations.AddField(
            model_name='account',
            name='org',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='exchange_app.Organization'),
        ),
        migrations.AddField(
            model_name='instrument',
            name='type',
            field=models.ForeignKey(default=0, on_delete=django.db.models.deletion.PROTECT, to='exchange_app.InstrumentType'),
        ),
    ]
