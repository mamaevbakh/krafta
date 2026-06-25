#!/usr/bin/env python3
"""
Semantic-search acceptance eval for Krafta storefront search.

Runs the REAL pipeline for every case: embed_query edge fn (text-embedding-3-large
@1536) -> catalog_search_auto RPC (RRF hybrid). Judges each result against an
explicit expectation regex over the returned titles.

Catalogs:
  vintage-shop (dev)  luxury goods, English titles + ru/uz/.. translations
  test-menu    (dev)  English cafe menu
  teplofest    (dev)  Russian handmade goods
  cafe         (prod) REAL Uzbek cafe, Russian menu (target use case)

ACCEPTANCE CRITERIA
  positive case: an expected title matches within top-K results -> PASS
  negative case: no strong match (max score < 0.06) or empty       -> PASS
  Per-type thresholds + overall >=90% must all hold for the suite to PASS.
"""
import json, re, os, subprocess, urllib.request, urllib.error, time, sys, ssl

SSLCTX = ssl._create_unverified_context()  # macOS python.org has no local CA bundle

# ---- env configs -----------------------------------------------------------
def load_env_file(path):
    d={}
    if os.path.exists(path):
        for line in open(path):
            line=line.strip()
            if not line or line.startswith('#') or '=' not in line: continue
            k,v=line.split('=',1); d[k]=v.strip().strip('"').strip("'")
    return d

ENVF = load_env_file('apps/krafta/.env.local')
DEV_URL = ENVF.get('KRAFTA_SUPABASE_URL') or ENVF.get('NEXT_PUBLIC_SUPABASE_URL')
DEV_KEY = ENVF.get('KRAFTA_SUPABASE_SECRET_KEY') or ENVF.get('SUPABASE_SECRET_KEY')

def prod_key():
    out = subprocess.run(
        'TOKEN=$(security find-generic-password -s "Supabase CLI" -w | sed "s/^go-keyring-base64://" | base64 -d); '
        'curl -s -H "Authorization: Bearer $TOKEN" '
        '"https://api.supabase.com/v1/projects/hlmcoirjaydrfqcmnuun/api-keys?reveal=true"',
        shell=True, capture_output=True, text=True).stdout
    keys = json.loads(out)
    for k in keys:
        if k.get('type')=='secret': return k['api_key']
    for k in keys:
        if k.get('name')=='service_role': return k['api_key']
    raise SystemExit('no prod secret key')

PROD_URL='https://hlmcoirjaydrfqcmnuun.supabase.co'
PROD_KEY=prod_key()

CAT = {
 'vintage': ('dev',  DEV_URL,  DEV_KEY,  'c7c17254-f189-44d8-9f05-db9e54be5d9b'),
 'menu':    ('dev',  DEV_URL,  DEV_KEY,  '63563e6e-947c-4084-bbc0-6a87443e94ca'),
 'teplo':   ('dev',  DEV_URL,  DEV_KEY,  'f8b26007-d6b1-48c3-8719-44eea55b2921'),
 'cafe':    ('prod', PROD_URL, PROD_KEY, 'fbe26b70-6c60-4d32-ac32-adce419d8770'),
}

def post(url, key, path, body):
    req = urllib.request.Request(url.rstrip('/')+path,
        data=json.dumps(body).encode(),
        headers={'Content-Type':'application/json','apikey':key,'Authorization':f'Bearer {key}'},
        method='POST')
    with urllib.request.urlopen(req, timeout=30, context=SSLCTX) as r:
        return json.load(r)

def _retry(fn, tries=3):
    last=None
    for a in range(tries):
        try: return fn()
        except Exception as e:
            last=e; time.sleep(0.6*(a+1))
    raise last

def search(cat, query, limit=8):
    env,url,key,cid = CAT[cat]
    emb = _retry(lambda: post(url,key,'/functions/v1/embed_query',{'query':query}))
    embedding = None if emb.get('skipped') else emb.get('embedding')
    body={'p_query':query,'p_limit':limit,'p_catalog_id':cid}
    if embedding is not None: body['p_query_embedding']=embedding
    rows = _retry(lambda: post(url,key,'/rest/v1/rpc/catalog_search_auto',body))
    return rows, (embedding is not None)

# ---- cases: (cat, query, type, expect_regex, K, polarity) ------------------
# polarity: 'pos' expected in top-K; 'neg' must NOT have a strong match
C=[
 # ============ vintage-shop : exact ============
 ('vintage','Andy Warhol Lee Harvey Oswald','exact',r'Andy Warhol',1,'pos'),
 ('vintage','Rolex Pearlmaster Datejust Watch','exact',r'Rolex',1,'pos'),
 ('vintage','RIMOWA Aluminum Suitcase','exact',r'RIMOWA Aluminum',1,'pos'),
 ('vintage','Loewe Flamenco Medium Shoulder Bag','exact',r'Loewe Flamenco',1,'pos'),
 ('vintage','Christian Louboutin Leather Studded Accents Sandals','exact',r'Louboutin',1,'pos'),
 # ============ vintage-shop : cross-lingual semantic (ru/uz -> en) ============
 ('vintage','часы','cross',r'Watch',3,'pos'),
 ('vintage','наручные часы','cross',r'Watch',3,'pos'),
 ('vintage','soat','cross',r'Watch',5,'pos'),
 ('vintage','сумка','cross',r'Bag|Christopher|Flamenco|Triomphe|Jige|Ophidia|Gucci|Hermès|Miu',3,'pos'),
 ('vintage','браслет','cross',r'Bracelet|Alhambra',3,'pos'),
 ('vintage','кольцо с бриллиантом','cross',r'Diamond|Emerald|Pendant|Brooch|Bracelet',3,'pos'),
 ('vintage','очки','cross',r'Sunglasses|Wayfarer|Eclipse',3,'pos'),
 ('vintage','солнцезащитные очки','cross',r'Sunglasses|Wayfarer',3,'pos'),
 ('vintage','чемодан','cross',r'Suitcase|RIMOWA|Rimowa',3,'pos'),
 ('vintage','кроссовки','cross',r'Nike|Jordan|Shox|Sneaker',5,'pos'),
 ('vintage','ботинки','cross',r'Boots|Saint Laurent',3,'pos'),
 ('vintage','сандалии','cross',r'Sandals|Louboutin',3,'pos'),
 ('vintage','рубашка','cross',r'Shirt|Demeulemeester|Shirtdress',3,'pos'),
 ('vintage','платье','cross',r'Gown|Dress|Shirtdress|Evening',3,'pos'),
 ('vintage','куртка','cross',r'Jacket|Rick Owens|Moto',3,'pos'),
 ('vintage','бриллиантовое колье','cross',r'Pendant|Diamond|Emerald',3,'pos'),
 ('vintage','sumka','cross',r'Bag|Christopher|Flamenco|Triomphe|Gucci',5,'pos'),
 ('vintage','браслет Van Cleef','cross',r'Alhambra|Van Cleef',3,'pos'),
 # ============ vintage-shop : concept / synonym / intent (en) ============
 ('vintage','wristwatch','concept',r'Watch',3,'pos'),
 ('vintage','timepiece','concept',r'Watch',5,'pos'),
 ('vintage','shades','concept',r'Sunglasses|Wayfarer',5,'pos'),
 ('vintage','purse','concept',r'Bag|Flamenco|Christopher|Triomphe|Clutch|Judith|Gucci',5,'pos'),
 ('vintage','luggage','concept',r'Suitcase|RIMOWA|Rimowa',3,'pos'),
 ('vintage','sneakers','concept',r'Nike|Jordan|Shox|Sneaker',3,'pos'),
 ('vintage','diamond jewelry','concept',r'Diamond|Emerald|Bracelet|Brooch|Pendant',3,'pos'),
 ('vintage','luxury watch','concept',r'Watch',3,'pos'),
 ('vintage','designer handbag','concept',r'Bag|Flamenco|Christopher|Triomphe|Gucci|Hermès|Miu',5,'pos'),
 ('vintage','artwork','concept',r'Warhol|Condo|Abramović|Goldin|Stahl|Teller',5,'pos'),
 ('vintage','wall art','concept',r'Warhol|Condo|Abramović|Goldin|Stahl|Teller',5,'pos'),
 ('vintage','gift for a watch collector','concept',r'Watch|Winder|WOLF',5,'pos'),
 ('vintage','iphone case','concept',r'iPhone|Kingsnake|Gucci',3,'pos'),
 ('vintage','beret','concept',r'Beret|Dior',3,'pos'),
 ('vintage','silk scarf','concept',r'Scarf|Hermès|Feux|Casaque|Mosa',5,'pos'),
 ('vintage','keychain','concept',r'Keychain|Charm|Bear|Sneaker',3,'pos'),
 ('vintage','trading card','concept',r'Trading Card|Bowman|Strasburg',3,'pos'),
 ('vintage','backpack to carry a laptop','concept',r'Christopher|Backpack|Bag',5,'pos'),
 # ============ vintage-shop : category ============
 ('vintage','jewelry','category',r'Jewelry|Diamond|Emerald|Bracelet|Watch|Pendant|Brooch',5,'pos'),
 ('vintage','bags','category',r'Bag|Flamenco|Christopher|Triomphe|Gucci',3,'pos'),
 ('vintage','украшения','category',r'Jewelry|Diamond|Emerald|Bracelet|Pendant|Brooch',5,'pos'),
 # ============ vintage-shop : typo ============
 ('vintage','warhal','typo',r'Warhol',3,'pos'),
 ('vintage','loewe flemenco','typo',r'Loewe Flamenco',3,'pos'),
 ('vintage','rimowa sutcase','typo',r'RIMOWA|Suitcase',3,'pos'),
 ('vintage','diamont pendant','typo',r'Diamond|Pendant',5,'pos'),
 # ============ vintage-shop : prefix ============
 ('vintage','rolex','prefix',r'Rolex',3,'pos'),
 ('vintage','warh','prefix',r'Warhol',3,'pos'),
 ('vintage','sunglas','prefix',r'Sunglasses',5,'pos'),
 # ============ vintage-shop : negative ============
 ('vintage','pizza','negative',r'',1,'neg'),
 ('vintage','washing machine','negative',r'',1,'neg'),

 # ============ test-menu : cross-lingual food ============
 ('menu','кофе','cross',r'Coffee',3,'pos'),
 ('menu','чай','cross',r'Tea',3,'pos'),
 ('menu','пицца','cross',r'Pizza|Margherita',1,'pos'),
 ('menu','бургер','cross',r'Burger',1,'pos'),
 ('menu','салат','cross',r'Salad',3,'pos'),
 ('menu','суп','cross',r'Soup',1,'pos'),
 ('menu','вода','cross',r'Water|Bottled',3,'pos'),
 ('menu','лимонад','cross',r'Lemonade',1,'pos'),
 ('menu','паста','cross',r'Pasta|Mediterranean',1,'pos'),
 ('menu','сэндвич','cross',r'Sandwich|Club|BBQ|Panini',3,'pos'),
 ('menu','курица','cross',r'Chicken|Caesar|Stuffed',3,'pos'),
 ('menu','рыба','cross',r'Fish|Tacos',3,'pos'),
 ('menu','смузи','cross',r'Smoothie',1,'pos'),
 ('menu','qahva','cross',r'Coffee',3,'pos'),
 ('menu','choy','cross',r'Tea',5,'pos'),
 # ============ test-menu : concept / intent ============
 ('menu','something vegetarian','concept',r'Vegetable|Quinoa|Caprese|Margherita|Spinach|Mushroom|Roasted',5,'pos'),
 ('menu','hot drink','concept',r'Coffee|Hot Tea',3,'pos'),
 ('menu','cold drink','concept',r'Iced Tea|Lemonade|Soft Drinks|Smoothie|Water',3,'pos'),
 ('menu','italian food','concept',r'Pizza|Pasta|Caprese|Panini|Margherita',3,'pos'),
 ('menu','meat dish','concept',r'Beef|Pork|Chicken|Burger|Stir-Fry',5,'pos'),
 # ============ test-menu : exact / typo ============
 ('menu','Margherita Pizza','exact',r'Margherita',1,'pos'),
 ('menu','margerita piza','typo',r'Margherita|Pizza',3,'pos'),
 ('menu','smothie','typo',r'Smoothie',3,'pos'),

 # ============ teplofest : en/uz -> ru semantic (reverse direction) ============
 ('teplo','candle','cross',r'свеча|свечой',3,'pos'),
 ('teplo','mug','cross',r'кружка',3,'pos'),
 ('teplo','scarf','cross',r'шарф|платок',3,'pos'),
 ('teplo','bag','cross',r'сумка',3,'pos'),
 ('teplo','vase','cross',r'ваза',3,'pos'),
 ('teplo','sweater','cross',r'свитер',3,'pos'),
 ('teplo','belt','cross',r'ремень',3,'pos'),
 ('teplo','jewelry','cross',r'украшение',5,'pos'),
 ('teplo','leather bag','concept',r'кожи|Хэндмейд сумка',5,'pos'),
 ('teplo','gift','concept',r'Подарочный|подарок|подарка',5,'pos'),
 ('teplo','свеча','exact',r'свеча',1,'pos'),
 ('teplo','кружка','exact',r'кружка',1,'pos'),
 ('teplo','подарок маме','concept',r'Подарочный|подарок|свеча|кружка|платок|украшение|шарф',5,'pos'),

 # ============ cafe (PROD) : the real target use case ============
 ('cafe','кофе','cross',r'Американо|Капучино|Латте|Эспрессо|Мокка|Раф|Флэт Вайт|Какао',3,'pos'),
 ('cafe','coffee','cross',r'Американо|Капучино|Латте|Эспрессо|Мокка|Раф|Флэт Вайт|Какао',5,'pos'),
 ('cafe','qahva','cross',r'Американо|Капучино|Латте|Эспрессо|Мокка|Раф|Флэт Вайт|Какао',5,'pos'),
 ('cafe','капучино','exact',r'Капучино',1,'pos'),
 ('cafe','cappuccino','cross',r'Капучино',3,'pos'),
 ('cafe','чай','cross',r'чай|Лимонник',3,'pos'),
 ('cafe','tea','cross',r'чай|Лимонник',5,'pos'),
 ('cafe','торт','cross',r'Торт|Медовик|Наполеон|Прага|Тирамису|Чизкейк|Эстерхазе|Брауни|Опера',3,'pos'),
 ('cafe','cake','cross',r'Торт|Медовик|Наполеон|Чизкейк|Тирамису|Прага|Брауни|Эстерхазе',5,'pos'),
 ('cafe','самса','exact',r'Самса',1,'pos'),
 ('cafe','чизкейк','exact',r'Чизкейк',1,'pos'),
 ('cafe','cheesecake','cross',r'Чизкейк',3,'pos'),
 ('cafe','тирамису','exact',r'Тирамису',1,'pos'),
 ('cafe','латте','exact',r'Латте',1,'pos'),
 ('cafe','круассан','exact',r'Круассан',1,'pos'),
 ('cafe','что-нибудь сладкое','concept',r'Торт|Медовик|Чизкейк|Тирамису|Эклер|Донат|Брауни|Пирожное|Милкшейк|Опера|Профитроли',5,'pos'),
 ('cafe','горячий напиток','concept',r'Американо|Капучино|Латте|Эспрессо|чай|Какао|Горячий шоколад|Раф|Мокка',5,'pos'),
 ('cafe','сок','cross',r'Фреш',3,'pos'),
 ('cafe','fresh juice','cross',r'Фреш',5,'pos'),
 ('cafe','молочный коктейль','cross',r'Милкшейк',3,'pos'),
 ('cafe','выпечка','concept',r'Самса|Круассан|Эклер|Донат|Булочка|Ватрушка|Беляш|Профитроли|Курник|Хачапури|Сосиска',5,'pos'),
 ('cafe','honey cake','cross',r'Медовик',5,'pos'),
 ('cafe','choy','cross',r'чай|Лимонник',5,'pos'),
 ('cafe','капучна','typo',r'Капучино',3,'pos'),
 ('cafe','тирамсу','typo',r'Тирамису',3,'pos'),
 ('cafe','шоколад','cross',r'шоколад|Брауни|Шоколадный|Какао|Чокопай',5,'pos'),
 ('cafe','суши','negative',r'',1,'neg'),
]

NEG_SCORE = 0.06  # below this = no strong (boosted/exact) match

def judge(case, rows):
    cat,q,typ,exp,k,pol = case
    titles=[(r.get('title') or '') for r in rows]
    topk=titles[:k]
    maxscore = max([r.get('score') or 0 for r in rows], default=0.0)
    mode = rows[0].get('mode') if rows else None
    if pol=='neg':
        ok = (len(rows)==0) or (maxscore < NEG_SCORE)
        hit = '(empty)' if not rows else f'top="{titles[0][:30]}" score={maxscore:.3f}'
        return ok, hit, mode
    rx=re.compile(exp, re.I)
    matched=[t for t in topk if rx.search(t)]
    ok=len(matched)>0
    hit = f'top{k}: ' + ' | '.join(t[:24] for t in topk)
    return ok, hit, mode

THRESH = {'exact':0.95,'cross':0.85,'concept':0.85,'category':0.80,'typo':0.80,'prefix':0.80,'negative':0.75,'OVERALL':0.90}

def main():
    print(f"DEV_URL set: {bool(DEV_URL)}  DEV_KEY set: {bool(DEV_KEY)}  PROD_KEY set: {bool(PROD_KEY)}")
    print(f"running {len(C)} cases...\n")
    results=[]
    for i,case in enumerate(C):
        cat,q,typ,exp,k,pol=case
        try:
            rows,had_emb=search(cat,q)
            ok,hit,mode=judge(case,rows)
        except Exception as e:
            ok,hit,mode,had_emb=False,f'ERROR {e}',None,False
        results.append((case,ok,hit,mode,had_emb))
        flag='PASS' if ok else 'FAIL'
        if not ok:
            print(f"  [{flag}] {cat:7} {typ:9} {q!r} -> {hit}")
        time.sleep(0.05)
    # aggregate
    from collections import defaultdict
    by=defaultdict(lambda:[0,0])
    semantic_keyword_leak=0
    for case,ok,hit,mode,had_emb in results:
        typ=case[2]
        by[typ][0]+=1; by[typ][1]+=1 if ok else 0
        if case[2] in ('cross','concept') and had_emb is False:
            semantic_keyword_leak+=1
    tot=len(results); passed=sum(1 for _,ok,_,_,_ in results if ok)
    print("\n================ ACCEPTANCE REPORT ================")
    print(f"{'type':10} {'pass/total':>10} {'rate':>6}  {'thresh':>6}  result")
    all_ok=True
    for typ in ['exact','cross','concept','category','typo','prefix','negative']:
        if typ not in by: continue
        t,p=by[typ][1],by[typ][0]
        rate=t/p; th=THRESH.get(typ,0.8); res='PASS' if rate>=th else 'FAIL'
        if rate<th: all_ok=False
        print(f"{typ:10} {f'{t}/{p}':>10} {rate*100:5.0f}% {th*100:5.0f}%  {res}")
    orate=passed/tot; oth=THRESH['OVERALL']; ores='PASS' if orate>=oth else 'FAIL'
    if orate<oth: all_ok=False
    print(f"{'-'*44}")
    print(f"{'OVERALL':10} {f'{passed}/{tot}':>10} {orate*100:5.0f}% {oth*100:5.0f}%  {ores}")
    print(f"semantic cases that fell back to keyword (embedding missing): {semantic_keyword_leak}")
    print(f"\nSUITE: {'PASS  ✅' if all_ok and orate>=oth else 'FAIL  ❌'}")
    return 0 if (all_ok and orate>=oth) else 1

if __name__=='__main__':
    sys.exit(main())
