// ── League configuration ─────────────────────────────────────
// Each league has a country code, display name, and number of slots
// in the European tournament. The first slot is always the local
// league champion for that season.
export const LEAGUES = [
  { id:'ESP', cc:'es',     name:'Spain',          slots:4 },
  { id:'GER', cc:'de',     name:'Germany',        slots:4 },
  { id:'ITA', cc:'it',     name:'Italy',          slots:4 },
  { id:'ENG', cc:'gb-eng', name:'England',        slots:4 },
  { id:'FRA', cc:'fr',     name:'France',         slots:2 },
  { id:'POR', cc:'pt',     name:'Portugal',       slots:2 },
  { id:'NED', cc:'nl',     name:'Netherlands',    slots:2 },
  { id:'TUR', cc:'tr',     name:'Turkey',         slots:1 },
  { id:'SCO', cc:'gb-sct', name:'Scotland',       slots:1 },
  { id:'RUS', cc:'ru',     name:'Russia',         slots:1 },
  { id:'UKR', cc:'ua',     name:'Ukraine',        slots:1 },
  { id:'GRE', cc:'gr',     name:'Greece',         slots:1 },
  { id:'ROE', cc:'eu',     name:'Rest of Europe', slots:5 },
]

// ── Team data ─────────────────────────────────────────────────
// Each team: { id, name, cc, league, money, hist }
//   money = annual income in millions (6-12 baseline). GM bonuses
//   can push effective income up to 14. This drives stat
//   generation: target stat = 41 + 4 × effective_money.
//     12 → center 89 (top: RM, Bayern, Liverpool, Milan, Juve, MUN, Arsenal)
//     11 → center 85 (BVB, Atlético, Inter, Porto, Ajax, Benfica, Spurs, Napoli)
//     10 → center 81 (PSG, City, Chelsea, PSV, Sporting, Gala, Zenit, Marseille, Newcastle, Shakhtar)
//     9  → center 77 (Sevilla, Leverkusen, Leipzig, Roma, Lazio, Lyon, Monaco, Valencia)
//     8  → center 73 (Villarreal, Bilbao, Sociedad, Betis, Frankfurt, Wolfsburg, Fiorentina, Atalanta, Villa, Feyenoord, Fenerbahce, Beşiktaş)
//     7  → center 69 (smaller top-5-league teams + bigger ROE/smaller-league sides)
//     6  → center 65 (minnows)
//   hist = legacy prestige (used for tie-breakers / historical
//   contexts). Independent from money.

export const SPAIN = [
  { id:'rm',   name:'Real Madrid',     league:'ESP', cc:'es', money:16, hist:200, colors:['#FFFFFF','#FEBE10'] },
  { id:'atm',  name:'Atlético Madrid', league:'ESP', cc:'es', money:12, hist:80 , colors:['#CB3524','#FFFFFF'] },
  { id:'sev',  name:'Sevilla',         league:'ESP', cc:'es', money:8,  hist:40 , colors:['#FFFFFF','#CC0000'] },
  { id:'rso',  name:'Real Sociedad',   league:'ESP', cc:'es', money:7,  hist:10 , colors:['#0067B1','#FFFFFF'] },
  { id:'vil',  name:'Villarreal',      league:'ESP', cc:'es', money:7,  hist:20 , colors:['#FFE667','#005187'] },
  { id:'ath',  name:'Athletic Bilbao', league:'ESP', cc:'es', money:7,  hist:10 , colors:['#EE2523','#FFFFFF'] },
  { id:'bet',  name:'Real Betis',      league:'ESP', cc:'es', money:7,  hist:8  , colors:['#0BB363','#FFFFFF'] },
  { id:'val',  name:'Valencia',        league:'ESP', cc:'es', money:8,  hist:25 , colors:['#F18E00','#000000'] },
]

export const GERMANY = [
  { id:'bay',  name:'Bayern Munich',     league:'GER', cc:'de', money:16, hist:180, colors:['#DC052D','#0066B2'] },
  { id:'bvb',  name:'Borussia Dortmund', league:'GER', cc:'de', money:12, hist:60 , colors:['#FDE100','#000000'] },
  { id:'b04',  name:'Bayer Leverkusen',  league:'GER', cc:'de', money:8,  hist:20 , colors:['#E32221','#000000'] },
  { id:'rbl',  name:'RB Leipzig',        league:'GER', cc:'de', money:8,  hist:15 , colors:['#DD0741','#FFFFFF'] },
  { id:'sge',  name:'Eintracht Frankfurt',league:'GER', cc:'de', money:7, hist:10 , colors:['#000000','#E1000F'] },
  { id:'wol',  name:'VfL Wolfsburg',     league:'GER', cc:'de', money:7,  hist:10 , colors:['#65B32E','#FFFFFF'] },
  { id:'sck',  name:'Schalke 04',        league:'GER', cc:'de', money:6,  hist:25 , colors:['#004D9D','#FFFFFF'] },
  { id:'svw',  name:'Werder Bremen',     league:'GER', cc:'de', money:6,  hist:15 , colors:['#1D9053','#FFFFFF'] },
]

export const ITALY = [
  { id:'juve', name:'Juventus',     league:'ITA', cc:'it', money:16, hist:120, colors:['#000000','#FFFFFF'] },
  { id:'acm',  name:'AC Milan',     league:'ITA', cc:'it', money:16, hist:130, colors:['#FB090B','#000000'] },
  { id:'int',  name:'Inter Milan',  league:'ITA', cc:'it', money:12, hist:100, colors:['#0068A8','#000000'] },
  { id:'nap',  name:'Napoli',       league:'ITA', cc:'it', money:12, hist:30 , colors:['#12A0D7','#FFFFFF'] },
  { id:'rom',  name:'AS Roma',      league:'ITA', cc:'it', money:8,  hist:30 , colors:['#8E1F2F','#F0BC42'] },
  { id:'fio',  name:'Fiorentina',   league:'ITA', cc:'it', money:7,  hist:15 , colors:['#5B2E91','#FFFFFF'] },
  { id:'laz',  name:'Lazio',        league:'ITA', cc:'it', money:8,  hist:20 , colors:['#87CEEB','#FFFFFF'] },
  { id:'ata',  name:'Atalanta',     league:'ITA', cc:'it', money:7,  hist:10 , colors:['#1F3A93','#000000'] },
]

export const ENGLAND = [
  { id:'mci',  name:'Manchester City',   league:'ENG', cc:'gb-eng', money:10, hist:100, colors:['#6CABDD','#FFFFFF'] },
  { id:'liv',  name:'Liverpool',         league:'ENG', cc:'gb-eng', money:16, hist:160, colors:['#C8102E','#00B2A9'] },
  { id:'ars',  name:'Arsenal',           league:'ENG', cc:'gb-eng', money:16, hist:40 , colors:['#EF0107','#FFFFFF'] },
  { id:'che',  name:'Chelsea',           league:'ENG', cc:'gb-eng', money:10, hist:80 , colors:['#034694','#FFFFFF'] },
  { id:'tot',  name:'Tottenham',         league:'ENG', cc:'gb-eng', money:12, hist:20 , colors:['#FFFFFF','#132257'] },
  { id:'mun',  name:'Manchester United', league:'ENG', cc:'gb-eng', money:16, hist:130, colors:['#DA291C','#FBE122'] },
  { id:'new',  name:'Newcastle',         league:'ENG', cc:'gb-eng', money:10, hist:10 , colors:['#241F20','#FFFFFF'] },
  { id:'avl',  name:'Aston Villa',       league:'ENG', cc:'gb-eng', money:7,  hist:15 , colors:['#95BFE5','#670E36'] },
]

export const FRANCE = [
  { id:'psg',  name:'Paris Saint-Germain',league:'FRA', cc:'fr', money:10, hist:30, colors:['#004170','#DA291C'] },
  { id:'oml',  name:'Olympique Lyon',    league:'FRA', cc:'fr', money:8,  hist:50 , colors:['#FFFFFF','#2FAEE0'] },
  { id:'mso',  name:'Olympique Marseille',league:'FRA', cc:'fr', money:10, hist:40, colors:['#003DA5','#FFFFFF'] },
  { id:'mon',  name:'Monaco',            league:'FRA', cc:'fr', money:8,  hist:30 , colors:['#CE1126','#FFFFFF'] },
]

export const PORTUGAL = [
  { id:'ben',  name:'Benfica',     league:'POR', cc:'pt', money:12, hist:60, colors:['#E20E13','#FFFFFF'] },
  { id:'por',  name:'FC Porto',    league:'POR', cc:'pt', money:12, hist:70, colors:['#00428C','#FFFFFF'] },
  { id:'spo',  name:'Sporting CP', league:'POR', cc:'pt', money:10, hist:30, colors:['#008057','#FFFFFF'] },
  { id:'bra',  name:'SC Braga',    league:'POR', cc:'pt', money:6,  hist:5 , colors:['#A50044','#FFFFFF'] },
]

export const NETHERLANDS = [
  { id:'ajx',  name:'Ajax',           league:'NED', cc:'nl', money:12, hist:80, colors:['#D2122E','#FFFFFF'] },
  { id:'psv',  name:'PSV Eindhoven',  league:'NED', cc:'nl', money:10, hist:40, colors:['#ED1C24','#FFFFFF'] },
  { id:'fey',  name:'Feyenoord',      league:'NED', cc:'nl', money:7,  hist:50, colors:['#CC0000','#FFFFFF'] },
  { id:'ams',  name:'AZ Alkmaar',     league:'NED', cc:'nl', money:6,  hist:5 , colors:['#FFFFFF','#003DA5'] },
]

export const TURKEY = [
  { id:'gal',  name:'Galatasaray', league:'TUR', cc:'tr', money:10, hist:20, colors:['#FBB034','#A90432'] },
  { id:'fck',  name:'Fenerbahçe',  league:'TUR', cc:'tr', money:7,  hist:10, colors:['#1F3A93','#FFE600'] },
  { id:'bes',  name:'Beşiktaş',    league:'TUR', cc:'tr', money:7,  hist:10, colors:['#000000','#FFFFFF'] },
]

export const SCOTLAND = [
  { id:'cel',  name:'Celtic',              league:'SCO', cc:'gb-sct', money:6, hist:30, colors:['#018749','#FFFFFF'] },
  { id:'ran',  name:'Rangers',             league:'SCO', cc:'gb-sct', money:5, hist:15, colors:['#003DA5','#FFFFFF'] },
  { id:'hea',  name:'Heart of Midlothian', league:'SCO', cc:'gb-sct', money:5, hist:5 , colors:['#700E22','#FFFFFF'] },
]

export const RUSSIA = [
  { id:'csm',  name:'CSKA Moscow',    league:'RUS', cc:'ru', money:6,  hist:20, colors:['#003C8C','#E1000F'] },
  { id:'spa',  name:'Spartak Moscow', league:'RUS', cc:'ru', money:6,  hist:15, colors:['#EE3624','#FFFFFF'] },
  { id:'zen',  name:'Zenit',          league:'RUS', cc:'ru', money:10, hist:10, colors:['#0E4F9E','#03BBE3'] },
]

export const UKRAINE = [
  { id:'she',  name:'Shakhtar Donetsk', league:'UKR', cc:'ua', money:10, hist:20, colors:['#FF6900','#000000'] },
  { id:'dyn',  name:'Dynamo Kyiv',      league:'UKR', cc:'ua', money:6,  hist:25, colors:['#0070BB','#FFFFFF'] },
]

export const GREECE = [
  { id:'oly',  name:'Olympiakos',     league:'GRE', cc:'gr', money:6, hist:15, colors:['#E32424','#FFFFFF'] },
  { id:'par',  name:'Panathinaikos',  league:'GRE', cc:'gr', money:5, hist:10, colors:['#016937','#FFFFFF'] },
  { id:'aek',  name:'AEK Athens',     league:'GRE', cc:'gr', money:5, hist:8 , colors:['#FFD700','#000000'] },
]

// Rest of Europe — these clubs all compete for 5 spots in a single
// pseudo-league. The top finisher is the "Rest of Europe champion".
export const REST_OF_EUROPE = [
  { id:'bru',  name:'Club Brugge',         league:'ROE', cc:'be', money:6, hist:15, colors:['#0066CC','#000000'] },
  { id:'and',  name:'Anderlecht',          league:'ROE', cc:'be', money:6, hist:20, colors:['#7B3F94','#FFFFFF'] },
  { id:'gen',  name:'Genk',                league:'ROE', cc:'be', money:5, hist:5 , colors:['#005EB8','#FFFFFF'] },
  { id:'kaa',  name:'KAA Gent',            league:'ROE', cc:'be', money:5, hist:5 , colors:['#1565C0','#FFFFFF'] },
  { id:'bsl',  name:'FC Basel',            league:'ROE', cc:'ch', money:6, hist:10, colors:['#E2231A','#003DA5'] },
  { id:'ybs',  name:'Young Boys',          league:'ROE', cc:'ch', money:5, hist:5 , colors:['#FFD700','#000000'] },
  { id:'rbs',  name:'Red Bull Salzburg',   league:'ROE', cc:'at', money:6, hist:5 , colors:['#EC1B23','#FFFFFF'] },
  { id:'stu',  name:'Sturm Graz',          league:'ROE', cc:'at', money:5, hist:5 , colors:['#000000','#FFFFFF'] },
  { id:'cfr',  name:'CFR Cluj',            league:'ROE', cc:'ro', money:5, hist:5 , colors:['#7F0E18','#FFFFFF'] },
  { id:'fcs',  name:'FCSB',                league:'ROE', cc:'ro', money:5, hist:10, colors:['#E1000F','#1F4096'] },
  { id:'slo',  name:'Slavia Prague',       league:'ROE', cc:'cz', money:6, hist:10, colors:['#1F4096','#FFFFFF'] },
  { id:'vkt',  name:'Viktoria Plzeň',      league:'ROE', cc:'cz', money:5, hist:5 , colors:['#003DA5','#E1000F'] },
  { id:'lsk',  name:'Legia Warsaw',        league:'ROE', cc:'pl', money:5, hist:5 , colors:['#E1000F','#FFFFFF'] },
  { id:'rak',  name:'Raków',               league:'ROE', cc:'pl', money:5, hist:3 , colors:['#0033A0','#FFFFFF'] },
  { id:'mol',  name:'Molde',               league:'ROE', cc:'no', money:5, hist:3 , colors:['#0058AB','#FFFFFF'] },
  { id:'bodo', name:'Bodø/Glimt',          league:'ROE', cc:'no', money:6, hist:5 , colors:['#FFE600','#000000'] },
  { id:'mal',  name:'Malmö FF',            league:'ROE', cc:'se', money:6, hist:8 , colors:['#5BBAE5','#FFFFFF'] },
  { id:'mid',  name:'Midtjylland',         league:'ROE', cc:'dk', money:5, hist:5 , colors:['#000000','#FFE600'] },
  { id:'cop',  name:'FC Copenhagen',       league:'ROE', cc:'dk', money:6, hist:8 , colors:['#FFFFFF','#003DA5'] },
  { id:'din',  name:'Dinamo Zagreb',       league:'ROE', cc:'hr', money:6, hist:10, colors:['#1F4096','#FFFFFF'] },
  { id:'haj',  name:'Hajduk Split',        league:'ROE', cc:'hr', money:5, hist:5 , colors:['#FFFFFF','#0033A0'] },
  { id:'fer',  name:'Ferencváros',         league:'ROE', cc:'hu', money:5, hist:8 , colors:['#FFD700','#003DA5'] },
  { id:'lud',  name:'Ludogorets',          league:'ROE', cc:'bg', money:5, hist:5 , colors:['#42A33C','#FFFFFF'] },
]

// Group all teams by league so engine can run local league sims.
export const LEAGUE_TEAMS = {
  ESP: SPAIN, GER: GERMANY, ITA: ITALY, ENG: ENGLAND,
  FRA: FRANCE, POR: PORTUGAL, NED: NETHERLANDS,
  TUR: TURKEY, SCO: SCOTLAND, RUS: RUSSIA, UKR: UKRAINE, GRE: GREECE,
  ROE: REST_OF_EUROPE,
}

export const ALL_TEAMS = [
  ...SPAIN, ...GERMANY, ...ITALY, ...ENGLAND, ...FRANCE, ...PORTUGAL,
  ...NETHERLANDS, ...TURKEY, ...SCOTLAND, ...RUSSIA, ...UKRAINE, ...GREECE,
  ...REST_OF_EUROPE
]
