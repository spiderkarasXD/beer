'use strict';
/* =========================================================
   CaseBeer — данные: игроки ленты, редкости
   ========================================================= */

// Люди в ленте «Последние дропы» (lafore выбивает только ножи)
const USERS = ["flankker","4x3","kotak_bas","артем1337","12kkot","noul","illka2407","shekebede","pidor","marklox228","moskwich","mecori","deltoao","fakitly","liana1xx","dviz","arsovich","егор1337","v1","gemeni","lafore","gart","m1dni9ht","pixel","amnam","chellol","pookie","xrenobys","coolver","rayla","7sofa7","wnexy","dalbanzik","KFCfan99","ColdFace","Sniper228","s1mple_fan","FlashGod","Вася_Пупкин","BWN_master","g2_enjoyer","navi_enjoyer","major_kid","clutch_king","aim_trainer","one_tap_god","ecoround","rush_b","molotov_man","bhopper","pro_noob","hphvdom","dumchik"];

const RARITY = {
  consumer:   { name: 'Ширпотреб',        color: 'var(--r-consumer)' },
  industrial: { name: 'Промышленное',     color: 'var(--r-industrial)' },
  milspec:    { name: 'Армейское',        color: 'var(--r-milspec)' },
  restricted: { name: 'Запрещённое',      color: 'var(--r-restricted)' },
  classified: { name: 'Засекреченное',    color: 'var(--r-classified)' },
  covert:     { name: 'Тайное',           color: 'var(--r-covert)' },
  gold:       { name: '★ Редкий предмет', color: 'var(--r-gold)' },
};

// Скины и кейсы — в catalog.js (генерируется cb/tools/build-catalog.mjs).
