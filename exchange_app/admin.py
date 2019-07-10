from django.apps import apps
from django.contrib import admin
from django.contrib.admin.sites import AlreadyRegistered
from guardian.admin import GuardedModelAdmin
from .models import (
    Account,
    Organization,
    Instrument
)


# With object permissions support
class AccountAdmin(GuardedModelAdmin):
    pass
class OrganizationAdmin(GuardedModelAdmin):
    pass
class InstrumentAdmin(GuardedModelAdmin):
    pass

admin.site.register(Account, AccountAdmin)
admin.site.register(Organization, OrganizationAdmin)
admin.site.register(Instrument, InstrumentAdmin)

# Default 
app_models = apps.get_app_config('exchange_app').get_models()
for model in app_models:
    try:
        admin.site.register(model)
    except AlreadyRegistered:
        pass

