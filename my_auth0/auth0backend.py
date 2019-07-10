from urllib import request
from jose import jwt
from social_core.backends.oauth import BaseOAuth2
from exchange import settings

class Auth0(BaseOAuth2):
    """Auth0 OAuth authentication backend"""
    name = 'auth0'
    SCOPE_SEPARATOR = ' '
    ACCESS_TOKEN_METHOD = 'POST'
    EXTRA_DATA = [
        ('picture', 'picture')
    ]

    def authorization_url(self):
        return 'https://' + self.setting('DOMAIN') + '/authorize'

    def access_token_url(self):
        return 'https://' + self.setting('DOMAIN') + '/oauth/token'

    def get_user_id(self, details, response):
        """Return current user id."""
        return details['user_id']

    def get_user_details(self, response):
        # Obtain JWT and the keys to validate the signature
        id_token = response.get('id_token')
        jwks = request.urlopen('https://' + self.setting('DOMAIN') +  '/.well-known/jwks.json')
        issuer = 'https://' + self.setting('DOMAIN') + '/'
        audience = self.setting('KEY')  # CLIENT_ID
        payload = jwt.decode(id_token, jwks.read(), algorithms=['RS256'], audience=audience, issuer=issuer)
        name_parts = payload['name'].split(' ')
        first_name = name_parts[0]
        last_name = " ".join(name_parts[1:])
        email = payload['email']

        # if settings.LOGIN_HOOK:
        #     settings.LOGIN_HOOK(payload)
        return { ** payload, **{'username': payload['nickname'],
                'first_name': first_name, 'last_name': last_name, 'email': email,
                'picture': payload['picture'],
                'user_id': payload['sub']},}




def create_user_related_objects(backend, user, response, *args, **kwargs):
    print("DEBUG pipeline step backend =", backend)
    print("DEBUG pipeline step user =", user)
    print("DEBUG pipeline step response =", response)
    print("DEBUG pipeline step args =", args)
    print("DEBUG pipeline step kwargs=", args)
    save_login(backend.get_user_details(response))

def save_login(payload):
    from django.contrib.auth.models import User
    from django.utils import timezone
    import exchange_app.models as models
    print("------------ payload login - anu",payload)
    email = payload["email"]
    nickname = payload["nickname"]
    name = payload['name']
    sub = payload['sub'] 
    u = User.objects.filter(email=email).first()
    sa = models.SocialAccount.objects.filter(email=email).first()
    print('DBG still here')
    if not sa:
        print("DEBUG New User. Adding SocialAccount")
        sa = models.SocialAccount(email=email, name=name, nickname=nickname, sub=sub)
        
        if u:
            pass
        #     if not u.email:
        #         u.email = email
        #         u.save()
        else:
            print("User doesn't exist for ", email)
            # Add User
            name_parts = name.split(' ')

            u = User(email=email, username=nickname, first_name=name_parts[0],
                     last_name=" ".join(name_parts[1:]))
            u.save()

        sa.user = u
        sa.save()
    print ("+++++ SA")
    o = models.Organization.objects.filter(abbrev=nickname + 'Org').first()
    if not o:
        print("Adding Org")
        # Add a personal Organization
        o = models.Organization(name=name + ' Org', abbrev=nickname + 'Org')
        o.save()
        print("added org ", o.abbrev)
    print("***** Org ok")
    t = models.Trader.objects.filter(user=u).first()
    if not t:
        # Add Trader
        t = models.Trader(user=u, org=o)
        t.save()
        print("added trader ", t.user.username)
    print ("Trader org for user {} is {}".format(u.username, t.org.abbrev))
    a = models.Account.objects.filter(name=name + ' a/c').first()
    if not a:
        # Add a personal account
        a = models.Account(org=o, name=name + ' a/c')
        a.save()
        print("added a/c ", a.name)

    sl = models.Login(social_account=sa, timestamp=timezone.now())
    sl.save()

