'use strict';
/* =========================================================
   CaseBeer — данные: игроки ленты, скины, кейсы
   ========================================================= */

// Люди в ленте «Последние дропы» (lafore выбивает только ножи)
const USERS = ["flankker","4x3","kotak_bas","артем1337","12kkot","noul","illka2407","shekebede","pidor","marklox228","moskwich","mecori","deltoao","fakitly","liana1xx","dviz","arsovich","егор1337","v1","gemeni","lafore","gart","m1dni9ht","pixel","amnam","chellol","pookie","xrenobys","coolver","rayla","7sofa7","wnexy","dalbanzik","KFCfan99","ColdFace","Sniper228","s1mple_fan","FlashGod","Вася_Пупкин","BWN_master","g2_enjoyer","navi_enjoyer","major_kid","clutch_king","aim_trainer","one_tap_god","ecoround","rush_b","molotov_man","bhopper","pro_noob"];

const RARITY = {
  consumer:   { name: 'Ширпотреб',        color: 'var(--r-consumer)' },
  industrial: { name: 'Промышленное',     color: 'var(--r-industrial)' },
  milspec:    { name: 'Армейское',        color: 'var(--r-milspec)' },
  restricted: { name: 'Запрещённое',      color: 'var(--r-restricted)' },
  classified: { name: 'Засекреченное',    color: 'var(--r-classified)' },
  covert:     { name: 'Тайное',           color: 'var(--r-covert)' },
  gold:       { name: '★ Редкий предмет', color: 'var(--r-gold)' },
};

// [id, оружие, скин, тип иконки, редкость, цена ₽]
const SKIN_ROWS = [
  ['p250-sand',   'P250', 'Sand Dune', 'pistol', 'consumer', 3],
  ['bizon-sand',  'PP-Bizon', 'Sand Dashed', 'smg', 'consumer', 3],
  ['g3-desert',   'G3SG1', 'Desert Storm', 'sniper', 'consumer', 4],
  ['mp9-sand',    'MP9', 'Sand Dashed', 'smg', 'consumer', 4],
  ['nova-pred',   'Nova', 'Predator', 'shotgun', 'consumer', 5],
  ['ump-urban',   'UMP-45', 'Urban DDPAT', 'smg', 'industrial', 6],
  ['sg-waves',    'SG 553', 'Waves Perforated', 'rifle', 'industrial', 7],
  ['mag7-metal',  'MAG-7', 'Metallic DDPAT', 'shotgun', 'industrial', 9],
  ['tec9-tornado','Tec-9', 'Tornado', 'pistol', 'industrial', 12],
  ['glock-bunsen','Glock-18', 'Bunsen Burner', 'pistol', 'milspec', 22],
  ['mp7-armor',   'MP7', 'Armor Core', 'smg', 'milspec', 18],
  ['p90-elite',   'P90', 'Elite Build', 'smg', 'milspec', 24],
  ['five-scumb',  'Five-SeveN', 'Scumbria', 'pistol', 'milspec', 30],
  ['usp-torque',  'USP-S', 'Torque', 'pistol', 'milspec', 42],
  ['m4s-flash',   'M4A1-S', 'Flashback', 'rifle', 'milspec', 60],
  ['famas-mecha', 'FAMAS', 'Mecha Industries', 'rifle', 'milspec', 85],
  ['ak-elite',    'AK-47', 'Elite Build', 'rifle', 'milspec', 110],
  ['p250-asii',   'P250', 'Asiimov', 'pistol', 'restricted', 170],
  ['usp-cortex',  'USP-S', 'Cortex', 'pistol', 'restricted', 220],
  ['ak-phantom',  'AK-47', 'Phantom Disruptor', 'rifle', 'restricted', 260],
  ['deagle-mecha','Desert Eagle', 'Mecha Industries', 'pistol', 'restricted', 300],
  ['awp-atheris', 'AWP', 'Atheris', 'sniper', 'restricted', 380],
  ['m4-daimyo',   'M4A4', 'Evil Daimyo', 'rifle', 'restricted', 420],
  ['glock-water', 'Glock-18', 'Water Elemental', 'pistol', 'restricted', 520],
  ['m4s-hyper',   'M4A1-S', 'Hyper Beast', 'rifle', 'classified', 2100],
  ['ak-neon',     'AK-47', 'Neon Rider', 'rifle', 'classified', 2600],
  ['deagle-red',  'Desert Eagle', 'Code Red', 'pistol', 'classified', 2900],
  ['awp-hyper',   'AWP', 'Hyper Beast', 'sniper', 'classified', 3400],
  ['usp-kill',    'USP-S', 'Kill Confirmed', 'pistol', 'classified', 4800],
  ['ak-blood',    'AK-47', 'Bloodsport', 'rifle', 'classified', 5200],
  ['m4-asii',     'M4A4', 'Asiimov', 'rifle', 'covert', 12000],
  ['awp-asii',    'AWP', 'Asiimov', 'sniper', 'covert', 14000],
  ['ak-vulcan',   'AK-47', 'Vulcan', 'rifle', 'covert', 21000],
  ['awp-light',   'AWP', 'Lightning Strike', 'sniper', 'covert', 38000],
  ['ak-serpent',  'AK-47', 'Fire Serpent', 'rifle', 'covert', 95000],
  ['m4-howl',     'M4A4', 'Howl', 'rifle', 'covert', 350000],
  ['awp-dlore',   'AWP', 'Dragon Lore', 'sniper', 'covert', 900000],
  ['navaja-sl',   '★ Navaja Knife', 'Slaughter', 'knife', 'gold', 14000],
  ['flip-auto',   '★ Flip Knife', 'Autotronic', 'knife', 'gold', 35000],
  ['bay-tiger',   '★ Bayonet', 'Tiger Tooth', 'knife', 'gold', 60000],
  ['kara-doppler','★ Karambit', 'Doppler', 'knife', 'gold', 95000],
  ['talon-marble','★ Talon Knife', 'Marble Fade', 'knife', 'gold', 110000],
  ['m9-lore',     '★ M9 Bayonet', 'Lore', 'knife', 'gold', 120000],
  ['spec-kimono', '★ Specialist Gloves', 'Crimson Kimono', 'gloves', 'gold', 130000],
  ['bfly-fade',   '★ Butterfly Knife', 'Fade', 'knife', 'gold', 180000],
  ['sport-vice',  '★ Sport Gloves', 'Vice', 'gloves', 'gold', 210000],
  ['kara-emerald','★ Karambit', 'Gamma Doppler Emerald', 'knife', 'gold', 1200000],
];
const SKINS = SKIN_ROWS.map(([id, weapon, skin, type, rarity, price]) => ({ id, weapon, skin, type, rarity, price }));
const SKIN = Object.fromEntries(SKINS.map((s) => [s.id, s]));

// Кейсы: состав + цена. Шансы считаются автоматически (см. calibrate в app.js),
// чтобы средний возврат кейса был ~90% от цены — как на типичных кейс-сайтах.
const CASES = [
  { id: 'free', name: 'Бесплатный', price: 0, color: '#2fd67b', icon: '🎁', free: true,
    items: ['p250-sand','bizon-sand','g3-desert','mp9-sand','nova-pred','ump-urban','sg-waves','mag7-metal','glock-bunsen','usp-torque','p250-asii'] },
  { id: 'beer', name: 'Пивной старт', price: 19, color: '#ffc94d', icon: '🍺',
    items: ['p250-sand','bizon-sand','g3-desert','mp9-sand','nova-pred','ump-urban','sg-waves','mag7-metal','tec9-tornado','glock-bunsen','p90-elite','usp-torque','ak-elite','ak-phantom'] },
  { id: 'pistol', name: 'Пистолетный', price: 49, color: '#b0c3d9', icon: '🔫',
    items: ['p250-sand','tec9-tornado','glock-bunsen','five-scumb','usp-torque','p250-asii','usp-cortex','deagle-mecha','glock-water','deagle-red','usp-kill'] },
  { id: 'milspec', name: 'Армейский', price: 99, color: '#4b69ff', icon: '🪖',
    items: ['ump-urban','sg-waves','mag7-metal','mp7-armor','p90-elite','m4s-flash','famas-mecha','ak-elite','ak-phantom','awp-atheris','m4-daimyo','m4s-hyper','ak-neon'] },
  { id: 'ak', name: 'AK-47', price: 249, color: '#eb4b4b', icon: '🔥',
    items: ['mp9-sand','ump-urban','p90-elite','ak-elite','ak-phantom','m4-daimyo','glock-water','ak-neon','ak-blood','ak-vulcan','ak-serpent'] },
  { id: 'awp', name: 'AWP', price: 399, color: '#8847ff', icon: '🎯',
    items: ['g3-desert','mp7-armor','famas-mecha','awp-atheris','deagle-mecha','glock-water','awp-hyper','deagle-red','awp-asii','awp-light','awp-dlore'] },
  { id: 'covert', name: 'Тайный', price: 990, color: '#d32ce6', icon: '💀',
    items: ['p90-elite','m4s-flash','ak-elite','usp-cortex','awp-atheris','m4-daimyo','m4s-hyper','ak-neon','usp-kill','m4-asii','awp-asii','ak-vulcan','awp-light','ak-serpent'] },
  { id: 'knife', name: 'Ножевой', price: 1499, color: '#e4ae39', icon: '🔪',
    items: ['five-scumb','usp-torque','famas-mecha','ak-phantom','awp-atheris','glock-water','ak-neon','deagle-red','navaja-sl','flip-auto','bay-tiger','kara-doppler','talon-marble','m9-lore','bfly-fade'] },
  { id: 'gloves', name: 'Перчатки', price: 2999, color: '#2fd67b', icon: '🧤',
    items: ['usp-cortex','m4-daimyo','glock-water','m4s-hyper','awp-hyper','ak-blood','m4-asii','spec-kimono','sport-vice','flip-auto','kara-doppler'] },
  { id: 'high', name: 'Хайроллер', price: 9999, color: '#ff4d5e', icon: '💎',
    items: ['ak-neon','deagle-red','usp-kill','ak-blood','m4-asii','awp-asii','ak-vulcan','awp-light','bay-tiger','kara-doppler','m9-lore','bfly-fade','sport-vice','ak-serpent','m4-howl'] },
  { id: 'dlore', name: 'Драконий', price: 49999, color: '#ff9f1a', icon: '🐲',
    items: ['m4-asii','awp-asii','ak-vulcan','awp-light','kara-doppler','talon-marble','m9-lore','bfly-fade','sport-vice','m4-howl','awp-dlore','kara-emerald'] },
];
