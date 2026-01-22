# 1. Product: что это за поиск

**Цель:**
Очень быстрый и умный поиск по каталогу (items + categories), который:

* работает с короткими запросами (`B`, `bor`, `art`)
* понимает намерение (`попить` → вода)
* поддерживает несколько языков
* сам решает: keyword или hybrid
* логируется для улучшения качества

**UX как у Algolia / Shopify / Airbnb**:

* пользователь просто печатает
* система сама выбирает стратегию
* результаты появляются мгновенно

---

# 2. Архитектура поиска

```
User Input
   ↓
API /search
   ↓
Edge Function embed_query (OpenAI)
   ↓
Postgres RPC catalog_search_auto
   ↓
catalog_search_documents (fts + trgm + halfvec)
   ↓
Results
   ↓
log_search (analytics)
```

---

# 3. Общий Flow (обязательно)

### Всегда одинаковый поток, без условий на фронте

1. Пользователь вводит текст
2. Backend вызывает `embed_query`
3. Backend вызывает `catalog_search_auto`
4. Backend логирует запрос
5. Backend возвращает результат

❗ **Фронт не решает keyword / hybrid — это делает SQL**

---

# 4. Edge Function: `embed_query`

### Назначение

Преобразует пользовательский запрос в embedding (`halfvec(1536)`).

### Endpoint

```
POST /functions/v1/embed_query
```

### Request

```json
{
  "query": "искусство"
}
```

### Response

```json
{
  "embedding": "[0.0123, -0.0456, ...]",
  "skipped": false
}
```

### Поведение

* если query слишком короткий → `skipped = true`
* иначе → embedding через OpenAI

---

# 5. SQL: основной поисковый RPC

## `catalog_search_auto(...)`

```sql
catalog_search_auto(
  p_query text,
  p_query_embedding halfvec(1536) | null,
  p_limit int,
  p_org_id uuid | null,
  p_catalog_id uuid | null
)
```

### Возвращает

| поле        | описание           |
| ----------- | ------------------ |
| id          | id документа       |
| title       | заголовок          |
| description | описание           |
| tags        | теги               |
| score       | итоговый скор      |
| mode        | keyword / hybrid   |
| distance    | embedding distance |

### Логика выбора режима

* `embedding = null` → **keyword**
* `query.length < 3` → **keyword**
* иначе → **hybrid**

### Используемые технологии

* `tsvector` (FTS)
* `pg_trgm` (опечатки)
* `halfvec + HNSW` (semantic)
* `synonyms` (язык пользователя)

---

# 6. Логирование поиска (обязательно)

### Таблица

```sql
public.search_logs
```

### Зачем

* видеть, что ищут
* понимать, где 0 результатов
* улучшать synonyms
* анализировать UX

### RPC

```sql
log_search(
  p_query,
  p_mode,
  p_has_embedding,
  p_results_count,
  p_top_result_id,
  p_org_id,
  p_catalog_id
)
```

---

# 7. Backend API: `/api/search`

### Пример (Next.js / Node)

```ts
import { createClient } from "@supabase/supabase-js";

export async function searchCatalog({
  query,
  catalogId,
  orgId,
  limit = 20
}) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Get embedding
  const embedRes = await fetch(
    `${process.env.SUPABASE_URL}/functions/v1/embed_query`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query })
    }
  ).then(r => r.json());

  const embedding = embedRes.skipped
    ? null
    : embedRes.embedding;

  // 2. Search
  const { data: results } = await supabase.rpc(
    "catalog_search_auto",
    {
      p_query: query,
      p_query_embedding: embedding,
      p_limit: limit,
      p_org_id: orgId,
      p_catalog_id: catalogId
    }
  );

  // 3. Log
  await supabase.rpc("log_search", {
    p_query: query,
    p_mode: results?.[0]?.mode ?? "none",
    p_has_embedding: !!embedding,
    p_results_count: results?.length ?? 0,
    p_top_result_id: results?.[0]?.id ?? null,
    p_org_id: orgId,
    p_catalog_id: catalogId
  });

  return results;
}
```

---

# 8. Frontend usage (минимум)

```ts
const results = await fetch("/api/search", {
  method: "POST",
  body: JSON.stringify({
    query: inputValue,
    catalogId
  })
}).then(r => r.json());
```

### UX-рекомендации

* debounce 150–300ms
* показывать результат уже с 1–2 букв
* сортировка — уже по `score`

---

# 9. Product features, которые уже готовы

✅ Multilingual intent search
✅ Keyword + semantic hybrid
✅ Опечатки
✅ Short queries
✅ Analytics
✅ Synonyms
✅ Масштабируемость

---

# 10. Что **НЕ** нужно делать

❌ Не делать отдельные keyword / semantic endpoints
❌ Не решать режим на фронте
❌ Не дергать OpenAI напрямую с клиента
❌ Не писать бизнес-логику в JS вместо SQL

---

# 11. Checklist «готово к продакшену»

* [x] catalog_search_documents заполнена
* [x] embeddings сгенерированы
* [x] HNSW индекс есть
* [x] embed_query работает
* [x] catalog_search_auto работает
* [x] search_logs пишется
* [ ] synonyms наполняются со временем
* [ ] UI debounce