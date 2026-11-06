ALTER TABLE "Article" ADD COLUMN "translationId" TEXT;

CREATE UNIQUE INDEX "Article_translationId_key" ON "Article"("translationId");

ALTER TABLE "Article" ADD CONSTRAINT "Article_translationId_fkey"
  FOREIGN KEY ("translationId") REFERENCES "Article"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The two Fire Accs articles were verified against the public article API.
UPDATE "Article" SET "translationId" = 'c5eb9d92-93d4-4c2f-b400-de1784290a71'
WHERE "id" = '27728196-eab7-4832-aa5e-6b6f4ccc8674'
  AND "lang" = 'en'
  AND EXISTS (
    SELECT 1 FROM "Article"
    WHERE "id" = 'c5eb9d92-93d4-4c2f-b400-de1784290a71' AND "lang" = 'ru'
  );

-- Additional title-verified bilingual pairs. Unmatched articles stay unlinked.
UPDATE "Article" AS en SET "translationId" = ru."id"
FROM "Article" AS ru,
  (VALUES
    ('grass-how-to-make-money-using-a-proxy-and-an-anti-detection-browser', 'grass-kak-zarabotat-ispolzuya-proksi-i-anti-detekt-brauzer'),
    ('cloakinghouse-the-secret-tool-for-affiliate-marketers-to-bypass-bans-and-protect-traffic', 'cloakinghouse-sekretnyj-instrument-arbitrazhnika-dlya-obhoda-blokirovok-i-zashity-trafika'),
    ('avoid-tiktok-account-bans-with-duoplus-a-complete-guide-to-stable-operations', 'kak-duoplus-pomogaet-izbezhat-blokirovki-akkauntov-tiktok-v-2025-godu'),
    ('accountdiversity-digital-goods-and-solutions-store-for-traffic-arbitrage', 'accountdiversity-magazin-cifrovyh-tovarov-i-reshenij-dlya-arbitrazha'),
    ('partnership-with-zenattica-profitable-reliable-promising', 'partnerstvo-s-zenattica-vygodno-nadezhno-perspektivno'),
    ('mostlogin-free-anti-association-antidect-browser-empowering-multi-account-management-and-automated-operations', 'mostloginbesplatnyj-brauzer-otpechatkov-otpechatkov-s-anti-associaciej-chtoby-pomoch-upravleniyu-i-avtomatizirovannym-upravleniem-s-mnozhestvennoj-uchetom-i-avtomaticheskoj-ekspluataciej'),
    ('funccards-virtual-cards-for-media-buying-and-business-payments', 'funccards-virtualnye-karty-dlya-mediabainga-i-biznes-platezhej'),
    ('flashid-the-free-anti-detect-browser-for-global-teams', 'flashid-besplatnyj-brauzer-s-zashitoj-ot-obnaruzheniya-dlya-mezhdunarodnyh-komand'),
    ('maximize-the-potential-of-geelark-cloud-android-smartphones-with-proxyluxe-proxy-servers', 'maksimizirujte-vozmozhnosti-oblachnyh-android-smartfonov-geelark-s-proksi-serverami-proxyluxe'),
    ('white-page-analysis-why-it-got-banned-an-affiliates-perspective', 'razbor-vajta-pochemu-uletel-v-ban-vzglyad-arbitrazhnika'),
    ('magic-click-partners-how-to-drive-gambling-and-betting-traffic-for-maximum-profit', 'magic-click-partners-kak-lit-trafik-na-gambling-i-betting-s-maksimalnym-profitom'),
    ('how-to-track-ads-and-analyze-competitor-strategies-with-spyhouse', 'kak-otslezhivat-reklamu-i-analizirovat-strategii-konkurentov-s-spyhouse'),
    ('smartlinks-as-a-convenient-starting-point-for-a-media-buyer', 'smartlinki-kak-udobnyj-start-dlya-mediabajera'),
    ('what-are-residential-proxies-used-for-and-why-do-people-need-them', 'dlya-chego-ispolzuyutsya-rezidentnye-proksi-i-zachem-oni-nuzhny'),
    ('afina-mcp-server-control-your-browser-through-an-ai-agent', 'mcp-server-afina-upravlyajte-brauzerom-cherez-ii-agenta'),
    ('socnet-store-more-than-just-a-digital-goods-marketplace', 'socnet-store-bolshe-chem-prosto-marketplejs-cifrovyh-tovarov'),
    ('undetectable-browser-is-a-professional-anti-detect-browser', 'undetectable-browser-professionalnyj-antidetekt-brauzer'),
    ('madbidcom-the-ultimate-marketplace-for-digital-assets', 'madbidcom-glavnaya-ploshadka-dlya-torgovli-cifrovymi-aktivami'),
    ('psb-hosting-is-a-vps-provider-with-servers-in-four-locations-across-europe-and-the-usa', 'psb-hosting-provajder-vps-s-serverami-v-chetyryoh-lokaciyah-evropy-i-ssha'),
    ('cloaking-from-scratch-how-to-hide-flows-from-moderation-and-why-its-useless-without-clean-proxies', 'kloaking-s-nulya-kak-pryatat-potoki-ot-moderacii-i-pochemu-bez-chistyh-proksi-vsyo-bespolezno'),
    ('how-todetect-helps-you-check-ip-quality-and-detect-proxy-risks', 'kak-todetect-pomogaet-proverit-kachestvo-ip-adresa-i-vyyavit-riski-proksi'),
    ('telegram-prime-a-detailed-overview-of-the-all-in-one-telegram-account-management-and-automation-suite', 'telegram-prime-podrobnyj-obzor-kompleksnogo-resheniya-dlya-upravleniya-telegram-akkauntami-i-avtomatizacii'),
    ('darkstore-digital-marketplace-for-accounts-and-digital-goods', 'darkstore-marketplejs-cifrovyh-tovarov-i-akkauntov'),
    ('payspend-virtual-cards-for-advertising-payments', 'virtualnye-karty-payspend-dlya-oplaty-reklamy'),
    ('how-to-choose-a-number-rental-term-for-repeated-sms-verification', 'kak-vybrat-srok-arendy-nomera-dlya-povtornyh-sms-podtverzhdenij')
  ) AS pair(en_slug, ru_slug)
WHERE en."slug" = pair.en_slug AND en."lang" = 'en'
  AND ru."slug" = pair.ru_slug AND ru."lang" = 'ru';
