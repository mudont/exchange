from .serializers import InstrumentSerializer
from rest_framework import viewsets
from .models import Instrument

class InstrumentViewSet(viewsets.ModelViewSet):
    queryset = Instrument.objects.all()
    serializer_class = InstrumentSerializer
