// ── Name databases per country ────────────────────────────
// Each entry: ~20 first names, ~20 last names common in that country.
export const NAME_DB = {
  es: { // Spain
    first: ['Sergio','Carlos','Marcos','Pablo','Alejandro','Luis','Álvaro','Daniel','Nacho','Iván','Saúl','Mikel','Ander','Aitor','Jordi','Gerard','Marc','Javi','Borja','Rodrigo'],
    last:  ['García','Martínez','López','Hernández','Rodríguez','Sánchez','Pérez','Gómez','Fernández','Torres','Moreno','Alonso','Ramos','Carvajal','Navas','Morata','Asensio','Ceballos','Jiménez','Merino']
  },
  de: { // Germany
    first: ['Thomas','Kai','Leroy','Joshua','Leon','Niklas','Toni','Serge','Mario','Florian','Jamal','Sven','Lukas','Marco','André','Julian','Robin','Max','Felix','Tim'],
    last:  ['Müller','Schulz','Becker','Kimmich','Goretzka','Süle','Kroos','Gnabry','Götze','Wirtz','Baumann','Kraft','Schneider','Reus','Brandt','Koch','Weber','Hoffmann','Wagner','Fischer']
  },
  it: { // Italy
    first: ['Lorenzo','Federico','Marco','Giacomo','Alessandro','Nicolò','Davide','Manuel','Sandro','Gianluca','Stefano','Roberto','Leonardo','Riccardo','Matteo','Luca','Andrea','Francesco','Antonio','Paolo'],
    last:  ['Russo','Ricci','Ferrari','Bianchi','Romano','Esposito','Conti','De Luca','Marino','Greco','Costa','Galli','Giordano','Bruno','Mancini','Rossi','Lombardi','Moretti','Barbieri','Fontana']
  },
  'gb-eng': { // England
    first: ['Harry','Marcus','Jack','Jordan','Declan','Mason','Phil','Luke','Conor','Reece','Bukayo','Emile','Jude','Harvey','Curtis','Ben','Ollie','James','Tom','Charlie'],
    last:  ['Smith','Jones','Walker','Wright','Cooper','Brown','Taylor','Davies','Wilson','Robinson','Clark','Hughes','Edwards','Holden','Foster','Kerr','Phillips','Shaw','Mitchell','Bennett']
  },
  fr: { // France
    first: ['Kylian','Antoine','Ousmane','Paul','Raphaël','Benjamin','Lucas','Kingsley','Jules','Wissam','Moussa','Nabil','Adrien','Mattéo','Jonathan','William','Léo','Christopher','Aurélien','Olivier'],
    last:  ['Dubois','Bernard','Petit','Durand','Leroy','Moreau','Laurent','Simon','Michel','Lefebvre','Rousseau','Vincent','Fournier','Girard','Bonnet','Lambert','Faure','Andre','Mercier','Blanc']
  },
  pt: { // Portugal
    first: ['Bruno','João','Diogo','Rúben','William','Gonçalo','Raphaël','André','Ricardo','Renato','Danilo','Hélder','Vítor','Tiago','Pedro','Nuno','Rui','Manuel','Miguel','Carlos'],
    last:  ['Silva','Santos','Pereira','Ferreira','Oliveira','Costa','Sousa','Rodrigues','Martins','Carvalho','Lopes','Gomes','Ribeiro','Marques','Almeida','Cardoso','Teixeira','Moreira','Mendes','Barbosa']
  },
  nl: { // Netherlands
    first: ['Daley','Matthijs','Ryan','Donny','Donyell','Steven','Luuk','Cody','Noa','Davy','Kenneth','Wout','Marten','Teun','Jerdy','Bart','Ruud','Sven','Joey','Tim'],
    last:  ['de Jong','van Dijk','Bakker','Visser','Smit','Meijer','de Vries','de Boer','Mulder','de Groot','Bos','Vos','Peters','Hendriks','Dekker','Brouwer','Maas','Kok','Jansen','Verhoeven']
  },
  ru: { // Russia
    first: ['Aleksandr','Sergey','Dmitry','Andrey','Mikhail','Maxim','Ivan','Roman','Pavel','Anton','Igor','Yuri','Nikita','Artem','Vladimir','Konstantin','Stanislav','Denis','Aleksey','Ilya'],
    last:  ['Ivanov','Smirnov','Kuznetsov','Popov','Sokolov','Lebedev','Kozlov','Novikov','Morozov','Petrov','Volkov','Solovyov','Vasilyev','Zaytsev','Pavlov','Semenov','Golubev','Vinogradov','Bogdanov','Vorobyev']
  },
  'gb-sct': { // Scotland
    first: ['Andrew','Callum','Scott','Stuart','Kieran','Kenny','Ryan','John','Liam','Lewis','Greg','Billy','Robbie','Ross','Iain','Calvin','Connor','Jamie','Steven','Aiden'],
    last:  ['MacLeod','Campbell','Stewart','Kennedy','Murray','Douglas','Robertson','McKenna','Fraser','Mackay','McGregor','Sinclair','Hendry','Cameron','Forrest','Christie','Tierney','Dykes','McTominay','Armstrong']
  },
  tr: { // Turkey
    first: ['Mehmet','Ahmet','Emre','Hakan','Cengiz','Burak','Arda','Yusuf','Çağlar','Merih','Kerem','Enes','Ozan','Caner','Selçuk','Volkan','Mert','Okay','Umut','Salih'],
    last:  ['Yıldız','Demir','Şahin','Çelik','Yılmaz','Öztürk','Doğan','Aslan','Kaya','Kurtuluş','Çalhanoğlu','Tosun','Tufan','Soyuncu','Elmas','Kabak','Akgün','Bayram','Ayhan','Ünder']
  },
  gr: { // Greece
    first: ['Giorgos','Dimitris','Konstantinos','Giannis','Vasilis','Christos','Nikolaos','Stefanos','Petros','Andreas','Manolis','Michalis','Sokratis','Kostas','Anastasios','Thanasis','Lefteris','Spyros','Vangelis','Tasos'],
    last:  ['Papadopoulos','Konstantinidis','Mavropanos','Pappas','Zafeiris','Galanopoulos','Bakasetas','Masouras','Pavlidis','Tzolis','Mantalos','Vlachodimos','Hatzigiovanis','Limnios','Karelis','Fortounis','Spiropoulos','Stafylidis','Kyriakopoulos','Tsimikas']
  },
  ua: { // Ukraine
    first: ['Andriy','Oleksandr','Mykola','Yaroslav','Roman','Ruslan','Vitaliy','Bohdan','Taras','Vasyl','Serhiy','Maksym','Dmytro','Pavlo','Ivan','Oleg','Igor','Volodymyr','Yevhen','Mykhailo'],
    last:  ['Shevchenko','Bondar','Kovalenko','Tymoshchuk','Yarmolenko','Zinchenko','Mudryk','Konoplyanka','Stepanenko','Sydorchuk','Karavaev','Kryvtsov','Tsyhankov','Pyatov','Buyalskyi','Marlos','Selin','Boiko','Khocholava','Sobol']
  },
  // Default European for "Rest of Europe" teams without specific DB
  eu: {
    first: ['Petar','Marko','Stefan','Luka','Ivan','Nikolai','Mateusz','Piotr','Tomasz','Karol','Magnus','Erik','Mikael','Lars','Anders','Janne','Jakub','David','Daniel','Adam'],
    last:  ['Novak','Petrović','Horvat','Kovač','Kowalski','Nowak','Lindberg','Berg','Andersson','Larsen','Hansen','Nielsen','Jensen','Virtanen','Korhonen','Black','Klein','Weiss','Müller','Schmidt']
  },
  // ── Non-European countries (for the 40% "other" star pool) ──
  br: { // Brazil
    first: ['Carlos','João','Pedro','Lucas','Felipe','Bruno','Rodrigo','Gabriel','Vinicius','Rafael','Thiago','Paulo','Marcelo','Diego','Renato','Eduardo','Antônio','Fabricio','André','Guilherme'],
    last:  ['Silva','Santos','Souza','Oliveira','Pereira','Lima','Costa','Ribeiro','Almeida','Rodrigues','Ferreira','Carvalho','Gomes','Martins','Araújo','Teixeira','Cardoso','Cavalcanti','Barbosa','Rocha']
  },
  ar: { // Argentina
    first: ['Lionel','Ángel','Sergio','Lautaro','Julián','Rodrigo','Cristian','Emiliano','Nicolás','Leandro','Marcos','Gonzalo','Mauro','Matías','Federico','Alejandro','Pablo','Diego','Gustavo','Juan'],
    last:  ['González','Rodríguez','Fernández','López','Martínez','Pérez','García','Sosa','Romero','Álvarez','Torres','Acosta','Domínguez','Suárez','Tagliafico','Mascherano','Higuain','Dybala','Lo Celso','Paredes']
  },
  uy: { // Uruguay
    first: ['Luis','Edinson','Diego','Federico','Rodrigo','Martín','Sebastián','Maximiliano','Nahitan','Giorgian','José','Matías','Lucas','Cristian','Nicolás','Gastón','Damián','Cristhian','Walter','Gianluca'],
    last:  ['Suárez','Cavani','Godín','Valverde','Bentancur','Cáceres','Coates','Pellistri','Núñez','de Arrascaeta','Giménez','Vecino','Torreira','Stuani','Lodeiro','Olivera','Rodríguez','Forlán','Recoba','Mendez']
  },
  mx: { // Mexico
    first: ['Hirving','Raúl','Edson','Carlos','Hugo','Diego','Andrés','Memo','Jesús','Néstor','Roberto','Erick','Orbelín','Uriel','Luis','Alexis','César','Javier','Héctor','Israel'],
    last:  ['Lozano','Jiménez','Álvarez','Salcedo','Vela','Reyes','Guardado','Ochoa','Corona','Araujo','Antuna','Gallardo','Pineda','Romo','Vega','Montes','Hernández','Moreno','Sánchez','Layún']
  },
  sn: { // Senegal
    first: ['Sadio','Kalidou','Idrissa','Edouard','Krepin','Boulaye','Pape','Ismaïla','Cheikhou','Famara','Bouna','Habib','Saliou','Ousmane','Salif','Demba','Mame','Moussa','Lamine','Abdou'],
    last:  ['Mané','Koulibaly','Gueye','Mendy','Diatta','Dia','Sarr','Kouyaté','Diédhiou','Sané','Diallo','Ciss','Ba','Cissé','Diouf','Konaté','Gassama','Ndoye','Ndiaye','Faye']
  },
  kr: { // South Korea
    first: ['Heung-min','Min-jae','Hwang','In-beom','Jae-sung','Woo-young','Chang-hoon','Hyun-jun','Seung-ho','Sang-ho','Min-woo','Tae-hee','Ji-sung','Kang-in','Young-gwon','Jae-hyun','Joo-ho','Yong-rae','Eui-jo','Yong'],
    last:  ['Son','Kim','Hee-chan','Hwang','Lee','Park','Choi','Jung','Kang','Yoon','Cho','Han','Shin','Oh','Bae','Hong','Jeon','Suh','Mun','Im']
  },
  ng: { // Nigeria
    first: ['Victor','Wilfred','Kelechi','Ademola','Samuel','Joe','Alex','William','Moses','Odion','Taiwo','Maduka','Bright','Kenneth','Henry','Frank','Chidozie','Innocent','Tyronne','Calvin'],
    last:  ['Osimhen','Ndidi','Iheanacho','Lookman','Chukwueze','Aribo','Iwobi','Troost-Ekong','Simon','Ighalo','Awoniyi','Okoye','Osayi-Samuel','Omeruo','Onyeka','Onyekuru','Awaziem','Bonaventure','Ebuehi','Bassey']
  },
}

// Country code → display name (used in qualifying screen, etc.)
export const COUNTRY_NAME = {
  es:'Spain', de:'Germany', it:'Italy', 'gb-eng':'England', fr:'France',
  pt:'Portugal', nl:'Netherlands', ru:'Russia', 'gb-sct':'Scotland',
  tr:'Turkey', gr:'Greece', ua:'Ukraine', br:'Brazil', ar:'Argentina',
  uy:'Uruguay', mx:'Mexico', sn:'Senegal', kr:'South Korea', ng:'Nigeria',
  be:'Belgium', ch:'Switzerland', at:'Austria', ro:'Romania', cz:'Czechia',
  pl:'Poland', no:'Norway', se:'Sweden', dk:'Denmark', hr:'Croatia',
  hu:'Hungary', bg:'Bulgaria', md:'Moldova', lv:'Latvia', si:'Slovenia',
  gi:'Gibraltar', eu:'Europe'
}

// Pick weighted random non-European nationality for a "foreign" star.
// Higher chance: BR/AR/UY. Lower: MX/SN/KR/NG.
const FOREIGN_NATIONALITIES = [
  { cc: 'br', weight: 30 },
  { cc: 'ar', weight: 22 },
  { cc: 'uy', weight: 14 },
  { cc: 'mx', weight: 9  },
  { cc: 'sn', weight: 9  },
  { cc: 'ng', weight: 9  },
  { cc: 'kr', weight: 7  },
]

export function pickForeignNationality() {
  const total = FOREIGN_NATIONALITIES.reduce((s, x) => s + x.weight, 0)
  let r = Math.random() * total
  for (const x of FOREIGN_NATIONALITIES) {
    r -= x.weight
    if (r <= 0) return x.cc
  }
  return FOREIGN_NATIONALITIES[0].cc
}

// Pick a nationality for a player born into a team of country `teamCC`.
// 60% same as team. 40% foreign (weighted).
export function pickPlayerNationality(teamCC) {
  if (Math.random() < 0.6) return teamCC
  return pickForeignNationality()
}

// Generate a name for a given nationality CC. Falls back to 'eu' pool.
export function genNameForCC(cc) {
  const pool = NAME_DB[cc] || NAME_DB.eu
  const first = pool.first[Math.floor(Math.random() * pool.first.length)]
  const last  = pool.last [Math.floor(Math.random() * pool.last.length)]
  return `${first} ${last}`
}

// Coach nationality is always the team's country (or fallback to 'eu').
export function genCoachName(cc) {
  return genNameForCC(NAME_DB[cc] ? cc : 'eu')
}
