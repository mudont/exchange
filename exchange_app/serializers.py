from .models import Instrument
from rest_framework import serializers

# Serializers define the API representation.
class InstrumentSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Instrument
        fields = ('symbol', 'name')

