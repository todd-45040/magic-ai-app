
const CACHE_NAME = 'magicians-ai-wizard-v0.79';
// All app shell files and external assets
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/social-image.svg',
  '/images/nav-wand.png',
  '/index.tsx',
  '/metadata.json',
  '/types.ts',
  '/constants.ts',
  '/App.tsx',
  '/components/About.tsx',
  '/components/AccountMenu.tsx',
  '/components/AssistantStudio.tsx',
  '/components/Auth.tsx',
  '/components/AudienceMode.tsx',
  '/components/ClientManagement.tsx',
  '/components/ContractGenerator.tsx',
  '/components/Dashboard.tsx',
  '/components/DirectorMode.tsx',
  '/components/DisclaimerModal.tsx',
  '/components/EffectGenerator.tsx',
  '/components/FeedbackModal.tsx',
  '/components/FormattedText.tsx',
  '/components/GlobalSearch.tsx',
  '/components/GospelMagicAssistant.tsx',
  '/components/HelpModal.tsx',
  '/components/icons.tsx',
  '/components/IllusionBlueprint.tsx',
  '/components/LiveFeedbackView.tsx',
  '/components/LiveRehearsal.tsx',
  '/components/MagicArchives.tsx',
  '/components/MagicDictionary.tsx',
  '/components/MagicTheoryTutor.tsx',
  '/components/MagicWire.tsx',
  '/components/MagicianMode.tsx',
  '/components/MarketingCampaign.tsx',
  '/components/MemberManagement.tsx',
  '/components/MentalismAssistant.tsx',
  '/components/ModeSelector.tsx',
  '/components/PassphraseInput.tsx',
  '/components/PatterEngine.tsx',
  '/components/PersonaSimulator.tsx',
  '/components/PropChecklists.tsx',
  '/components/SavedIdeas.tsx',
  '/components/ShareButton.tsx',
  '/components/ShowFeedback.tsx',
  '/components/ShowPlanner.tsx',
  '/components/UpgradeModal.tsx',
  '/components/VideoRehearsal.tsx',
  '/components/VisualBrainstorm.tsx',
  '/services/clientsService.ts',
  '/services/dashboardService.ts',
  '/services/feedbackService.ts',
  '/services/geminiService.ts',
  '/services/ideasService.ts',
  '/services/questionsService.ts',
  '/services/showsService.ts',
  '/services/usersService.ts',
  '/services/dataService.ts',
  '/services/performanceService.ts',
  '/services/suggestionService.ts',
  '/store.tsx',
  '/supabase.ts',
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Lato:wght@400;700&display=swap',
];

// Install the service worker and cache all the app's assets.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache and caching assets');
        const cachePromises = urlsToCache.map(url => {
            return cache.add(url).catch(err => {
                console.warn(`Failed to cache ${url}:`, err);
            });
        });
        return Promise.all(cachePromises);
      })
  );
});

// Intercept fetch requests and serve from cache if available (cache-first, falling back to network).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) return cachedResponse;

      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse.ok) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        console.error('Fetch failed; user is likely offline.', error);
        throw error;
      }
    })
  );
});

// Clean up old caches on activation.
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
