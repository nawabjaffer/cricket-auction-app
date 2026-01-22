# Image Preloading System - Technical Architecture

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AUCTION APP (React)                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                │                             │
         ┌──────▼──────┐             ┌────────▼────────┐
         │  useData    │             │  useAuction     │
         │   Hook      │             │    Hook         │
         └──────┬──────┘             └────────┬────────┘
                │                             │
                │ After all players load      │
                │                             │
         ┌──────▼─────────────────────────────▼──────────┐
         │  Collect All Image URLs (300+ URLs)          │
         │  ├─ Available Players imageUrl               │
         │  ├─ Sold Players imageUrl                   │
         │  └─ Unsold Players imageUrl                 │
         └──────────────┬────────────────────────────────┘
                        │
         ┌──────────────▼────────────────────┐
         │  imagePreloaderService.           │
         │  preloadImages(urls, {             │
         │    maxConcurrent: 6,               │
         │    timeout: 15000,                 │
         │    onProgress: callback            │
         │  })                                │
         └──────┬─────────────────────────────┘
                │
         ┌──────▼─────────────────────────────┐
         │  Image Preloader Engine            │
         │  ├─ Generate 6 concurrent batches  │
         │  ├─ For each image:                │
         │  │  ├─ Check cache (hit? return)  │
         │  │  ├─ Try primary URL             │
         │  │  ├─ On fail: try fallbacks      │
         │  │  ├─ Update cache status         │
         │  │  └─ Report progress             │
         │  └─ Return results                 │
         └──────┬─────────────────────────────┘
                │
        ┌───────┴────────────────────────┐
        │                                │
   ┌────▼──────────┐          ┌─────────▼─────────┐
   │  imageCacheService       │  Browser APIs     │
   │  ├─ Session Memory       │  ├─ Image()       │
   │  │  (Map)                │  ├─ fetch()       │
   │  ├─ LocalStorage         │  └─ localStorage  │
   │  └─ Status Tracking      │                   │
   └────┬──────────┘          └─────────┬─────────┘
        │                               │
   ┌────▼───────────────────────────────▼──────────┐
   │         Image Load Strategies                  │
   │                                                │
   │  1️⃣  lh3.googleusercontent.com                 │
   │      └─ Primary CDN endpoint (preferred)      │
   │                                                │
   │  2️⃣  drive.google.com/thumbnail               │
   │      └─ Thumbnail fallback                    │
   │                                                │
   │  3️⃣  drive.google.com/uc?export=view          │
   │      └─ Export endpoint fallback               │
   │                                                │
   │  4️⃣  ui-avatars.com                           │
   │      └─ Generated avatar final fallback       │
   │                                                │
   │  5️⃣  /placeholder_player.png                  │
   │      └─ Local placeholder (complete failure)  │
   └────┬──────────────────────────────────────────┘
        │
   ┌────▼─────────────────────────────────────┐
   │  Cache Storage (Dual-Layer)              │
   │                                          │
   │  Session Memory (Fast)                  │
   │  ├─ Type: Map<string, CachedImage>      │
   │  ├─ Lookup: O(1)                        │
   │  ├─ Persistence: Current session only   │
   │  └─ Speed: <1ms access                  │
   │                                          │
   │  LocalStorage (Persistent)              │
   │  ├─ Key: bcc_auction_image_cache        │
   │  ├─ Format: JSON                        │
   │  ├─ Expiry: 24 hours                    │
   │  ├─ Size: 5-10MB (300+ images)          │
   │  └─ Persistence: Across reloads         │
   └────┬─────────────────────────────────────┘
        │
   ┌────▼─────────────────────────────────┐
   │  useImagePreload Hook (Display)      │
   │  ├─ Check cache first                │
   │  ├─ Show loading spinner if missing  │
   │  ├─ Set image URL when loaded        │
   │  └─ Call onImageLoad callback        │
   └────┬──────────────────────────────────┘
        │
   ┌────▼──────────────────────┐
   │  Player Image Renders     │
   │  ├─ Cached: 100ms         │
   │  ├─ Network: 2-4s         │
   │  └─ Fallback: instant     │
   └──────────────────────────┘
```

## Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                            App Component                         │
│  useInitialData() → Fetches all players                        │
└────────┬───────────────────────────────────────────────────────┘
         │
         │ After all players loaded
         │
    ┌────▼────────────────────────────┐
    │  useData Hook                   │
    │  - useTeamsQuery()              │
    │  - usePlayersQuery()            │
    │  - useSoldPlayersQuery()        │
    │  - useUnsoldPlayersQuery()      │
    └────┬─────────────────────────────┘
         │
         │ useMemo: Collect all image URLs
         │
    ┌────▼──────────────────────────────────┐
    │  useEffect: Trigger Preloading        │
    │  imagePreloaderService.preloadImages()│
    └────┬─────────────────────────────────┘
         │
    ┌────▼──────────────────────────────────┐
    │  imagePreloaderService                │
    │  - preloadImages()                    │
    │  - preloadImage() x6 concurrent       │
    │  - Fallback chain on failure          │
    └────┬─────────────────────────────────┘
         │
    ┌────▼──────────────────────────────────┐
    │  imageCacheService                    │
    │  - markAsLoading()                    │
    │  - markAsLoaded()                     │
    │  - markAsFailed()                     │
    │  - persistToLocalStorage()            │
    └────────────────────────────────────────┘
         │
    ┌────▼──────────────────────────────────┐
    │  Browser Image Loading (Parallel)     │
    │  Image.src = url                      │
    │  ├─ onload → mark as loaded          │
    │  └─ onerror → try fallback           │
    └────────────────────────────────────────┘
         │
    ┌────▼──────────────────────────────────┐
    │  Cache Layer                          │
    │  ├─ Session: Map (O(1) lookup)       │
    │  └─ Persistent: localStorage         │
    └────┬───────────────────────────────────┘
         │
    ┌────▼──────────────────────────────────┐
    │  useImagePreload Hook (Display)       │
    │  When player selected:                │
    │  1. Check cache                       │
    │  2. Cached? Show instantly            │
    │  3. Not cached? Show loading spinner  │
    │  4. On image load → hide spinner      │
    └────────────────────────────────────────┘
```

## Data Structure Diagrams

### CachedImage Entry
```typescript
{
  url: "https://lh3.googleusercontent.com/d/abc123...",
  loadedAt: 1674556800000,              // Unix timestamp
  status: "success" | "failed" | "loading"
}
```

### ImageCacheData (LocalStorage)
```typescript
{
  version: 1,
  timestamp: 1674556800000,
  images: {
    "url1": { url: "url1", loadedAt: 1674..., status: "success" },
    "url2": { url: "url2", loadedAt: 1674..., status: "failed" },
    // ... 300+ more images
  }
}
```

### PreloadResult
```typescript
{
  successful: ["url1", "url2", ...],     // Successfully preloaded
  failed: ["url3", "url4", ...],         // Failed after retries
  total: 320,
  duration: 25000,                       // milliseconds
  successRate: 93.75                     // percentage
}
```

## State Flow Diagram

```
Initial State:
  - Session Cache: Empty
  - LocalStorage: Empty (or expired data)
  - Player Images: Not loaded
  - Loading Spinner: Not shown

App Initialization:
  ↓
  Fetch all player data (300+ players)
  ↓
  Collect image URLs
  ↓
  Trigger preload: imagePreloaderService.preloadImages(urls)
  ↓
  State: Preloading = true, Progress = 0/320
  ↓
  Concurrent Batch 1: Load images 0-5
  State: Progress = 6/320
  ↓
  Concurrent Batch 2: Load images 6-11
  State: Progress = 12/320
  ↓
  ... (continue for all batches)
  ↓
  Preloading Complete:
  - 300 images cached in session memory
  - 300 images persisted to localStorage
  - State: Preloading = false, Successful = 300, Failed = 20
  ↓
  User selects player:
  ┌─ Check cache
  ├─ Cache hit → Display immediately (0ms)
  └─ Cache miss → Show spinner, load from network (2-4s)
     ├─ Load success → Cache result
     └─ Load fail → Try fallbacks
        ├─ Fallback 1 → Try next
        ├─ Fallback 2 → Try next
        ├─ Fallback 3 → Try next
        └─ All failed → Show placeholder
  ↓
  Cache Status After N Player Switches:
  - Initial preload: 300 successful
  - User switches: +20 new cached (from fallbacks)
  - Fallback exhausted: Mark as failed
  Final: Session + LocalStorage contain ~320 images
```

## Performance Timeline

```
┌─────────────────────────────────────────────────────────┐
│  T=0ms: App starts                                      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  T=100-500ms: Fetch player data from Google Sheets      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  T=500-600ms: All data loaded, collect image URLs       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  T=600ms: Start preloading batch 1 (6 images)           │
│  ├─ Image 1: 500ms  ├─ Image 2: 600ms  ├─ Image 3: 450ms
│  ├─ Image 4: 550ms  ├─ Image 5: 480ms  ├─ Image 6: 520ms
│  └─ Batch 1 complete at T=1100ms (parallel = fastest)  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  T=1100ms: Start preloading batch 2 (6 images)          │
│  └─ Batch 2 complete at T=1600ms                       │
└─────────────────────────────────────────────────────────┘

  ... (similar batches every 500ms)

┌─────────────────────────────────────────────────────────┐
│  T=30000ms: All preloading complete                     │
│  ├─ 300 images cached in session memory               │
│  ├─ 300 images persisted to localStorage              │
│  └─ App fully responsive                              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  User selects Player #1                                 │
│  ├─ Check cache: HIT (T=0ms)                           │
│  └─ Display image: immediate                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  User selects Player #2                                 │
│  ├─ Check cache: HIT (T=0ms)                           │
│  └─ Display image: immediate                          │
└─────────────────────────────────────────────────────────┘
```

## Concurrency Model

```
Without Preloading (Sequential):
  Image 1: [====500ms====] 
  Image 2:                [====600ms====]
  Image 3:                           [====450ms====]
  Total: ~1550ms

With Preloading (6 Concurrent):
  Image 1: [====500ms====]
  Image 2: [====600ms====]
  Image 3: [====450ms====]
  Image 4: [====550ms====]
  Image 5: [====480ms====]
  Image 6: [====520ms====]
  Total: ~600ms (2.5x faster!)

For 320 images:
  Sequential: ~320 * 550ms average = ~176 seconds
  6 Concurrent: ~320/6 * 550ms = ~29 seconds
  Speedup: 6x faster!
```

## Error Handling Flow

```
preloadImage(url) called
  │
  ├─ Check cache
  │  ├─ Hit (success)? → Return true immediately
  │  └─ Miss? Continue...
  │
  ├─ Mark as loading
  │  
  ├─ Create Image element
  │  
  ├─ Set src = url (Primary)
  │  
  ├─ Wait for load/error
  │  │
  │  ├─ onload? 
  │  │  ├─ Mark as loaded ✅
  │  │  └─ Cache & return true
  │  │
  │  └─ onerror?
  │     └─ Try fallback #1
  │        │
  │        ├─ onload?
  │        │  ├─ Mark as loaded ✅
  │        │  └─ Cache & return true
  │        │
  │        └─ onerror?
  │           └─ Try fallback #2
  │              │
  │              ├─ onload?
  │              │  ├─ Mark as loaded ✅
  │              │  └─ Cache & return true
  │              │
  │              └─ onerror?
  │                 └─ Try fallback #3
  │                    │
  │                    ├─ onload?
  │                    │  ├─ Mark as loaded ✅
  │                    │  └─ Cache & return true
  │                    │
  │                    └─ onerror?
  │                       └─ Mark as failed ❌
  │                          Cache & return false
  │
  ├─ On Timeout (15s)
  │  ├─ Mark as failed ❌
  │  └─ Return false
  │
  └─ Finally: Cleanup Image element
```

---

**Architecture Version**: 1.0.0
**Last Updated**: January 22, 2026
**Status**: Production Ready ✅
