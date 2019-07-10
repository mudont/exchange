import jwt, re
import traceback
from channels.auth import AuthMiddlewareStack
from django.contrib.auth.models import AnonymousUser
from django.conf import LazySettings
from jwt import InvalidSignatureError, ExpiredSignatureError, DecodeError
from urllib import parse
from my_auth0.auth0backend import save_login

from django.contrib.auth.models import User
#logger = logging.getLogger("test")
settings = LazySettings()
import exchange.settings as S

class TokenAuthMiddleware:
    def __init__(self, inner):
        self.inner = inner

    def __call__(self, scope):
        try:
            query = parse.parse_qs(scope['query_string'].decode("utf-8"))['token'][0]
            if query and query != 'null':
                try:
                    print('+++++ got a token <{}>'.format(query))
                    user_jwt = jwt.decode(
                        query,
                        S.publickey,
                        audience=S.SOCIAL_AUTH_AUTH0_KEY
                    )
                    print('JWT data:', user_jwt)
                    for f in 'email', 'name', 'nickname':
                        user_jwt[f] = user_jwt[S.AUTH0_NAMESPACE][S.AUTH0_FIELD_PREFIX + f]

                    users = User.objects.filter(
                      email=user_jwt['email'])
                    if users:
                       scope['user'] = users[0]
                    else:
                       name_parts = user_jwt['name'].split(' ')
                       first_name = name_parts[0]
                       last_name = " ".join(name_parts[1:])
                       email = user_jwt['email']
                       
                       user = User(
                         username=user_jwt['nickname'],
                         first_name=first_name, last_name=last_name,
                         email=email
                       )
                       user.save()
                       scope['user'] = user
                    from django.db import transaction
                    cxn = transaction.get_connection()
                    if cxn.in_atomic_block:
                        print("----- We're inside a transaction!")
                    if transaction.get_autocommit():
                        print("----- We're in autocommit!")
                    @transaction.atomic
                    def _sl(uj):
                        save_login(uj)
                    _sl(user_jwt) 
                    print('+++++ got user {}'.format(scope['user']))
                except (InvalidSignatureError, KeyError, ExpiredSignatureError, DecodeError):
                    traceback.print_exc()
                    pass
                except Exception as e:  # NoQA
                    #logger.error(scope)
                    traceback.print_exc()

            return self.inner(scope)
        except:
            scope['user']=AnonymousUser()
            return self.inner(scope)

TokenAuthMiddlewareStack = lambda inner: TokenAuthMiddleware(AuthMiddlewareStack(inner))
