// Player name pools by nationality/region
export const PLAYER_NAMES = {
  spanish: {
    first: ['Sergio','Carlos','Marcos','Pablo','Alejandro','Luis','Álvaro','Dani','Nacho','Isco','Saúl','Mikel','Ander','Aitor','Jordi','Gerard','Pol','Marc','Ansu','Pedri'],
    last:  ['García','Martínez','López','Hernández','Rodríguez','Sánchez','Pérez','Gómez','Fernández','Torres','Moreno','Alonso','Ramos','Carvajal','Alba','Morata','Asensio','Ceballos','Canales','Merino']
  },
  german: {
    first: ['Thomas','Kai','Leroy','Joshua','Leon','Niklas','Toni','Serge','Mario','Ilkay','Florian','Jamal','Florian','Sven','Lukas','Marco','André','Julian','Emre','Robin'],
    last:  ['Müller','Havertz','Sané','Kimmich','Goretzka','Süle','Kroos','Gnabry','Götze','Gündogan','Wirtz','Musiala','Baumgartner','Kraft','Waldschmidt','Reus','Schürrle','Brandt','Can','Koch']
  },
  italian: {
    first: ['Lorenzo','Federico','Marco','Giacomo','Alessandro','Nicolo','Davide','Manuel','Sandro','Ciro','Bryan','Gianluca','Stefano','Roberto','Gianluigi','Leonardo','Riccardo','Jorginho','Matteo','Luca'],
    last:  ['Insigne','Chiesa','Verratti','Bonaventura','Florenzi','Barella','Calabria','Locatelli','Tonali','Immobile','Cristante','Pessina','Sensi','Mancini','Donnarumma','Bonucci','Calabria','Jorginho','Berardi','Pellegrini']
  },
  english: {
    first: ['Harry','Marcus','Raheem','Jordan','Declan','Mason','Phil','Jack','Kalvin','Trent','Luke','Conor','Reece','Bukayo','Emile','Jude','Harvey','Curtis','Ben','Ollie'],
    last:  ['Kane','Rashford','Sterling','Henderson','Rice','Mount','Foden','Grealish','Phillips','Alexander-Arnold','Shaw','Gallagher','James','Saka','Smith Rowe','Bellingham','Elliott','Jones','White','Watkins']
  },
  french: {
    first: ['Kylian','Antoine','Ousmane','Paul','Raphaël','Benjamin','Lucas','Kingsley','Jules','Presnel','Wissam','Moussa','Nabil','Adrien','Mattéo','Jonathan','William','Léo','Christopher','Aurélien'],
    last:  ['Mbappé','Griezmann','Dembélé','Pogba','Varane','Pavard','Hernandez','Coman','Koundé','Kimpembe','Ben Yedder','Diaby','Fekir','Rabiot','Guendouzi','Ikoné','Saliba','Dubois','Nkunku','Tchouaméni']
  },
  portuguese: {
    first: ['Cristiano','Bernardo','Bruno','João','Diogo','Rúben','William','Gonçalo','Raphaël','André','Ricardo','Renato','Danilo','Neto','Hélder','Mário','Vitinha','Matheus','Cédric','Domingos'],
    last:  ['Ronaldo','Silva','Fernandes','Félix','Jota','Dias','Carvalho','Guedes','Guerreiro','André Silva','Horta','Sanches','Pereira','Costa','Costa','Rui Silva','Nunes','Nunes','Soares','Queirós']
  },
  dutch: {
    first: ['Virgil','Georginio','Frenkie','Memphis','Daley','Matthijs','Ryan','Donny','Donyell','Steven','Luuk','Cody','Noa','Davy','Kenneth','Xavi','Wout','Marten','Teun','Jerdy'],
    last:  ['van Dijk','Wijnaldum','de Jong','Depay','Blind','de Ligt','Gravenberch','van de Beek','Malen','Bergwijn','de Jong','Gakpo','Lang','Klaassen','Taylor','Simons','Weghorst','de Roon','Koopmeiners','Schouten']
  },
  other: {
    first: ['Erling','Robert','Luka','Ivan','Kevin','Romelu','Eden','Axel','Granit','Xherdan','Yann','Jan','Timo','Kai','Mohamed','Sadio','Naby','Takumi','Hiroki','Son'],
    last:  ['Haaland','Lewandowski','Modrić','Perišić','De Bruyne','Lukaku','Hazard','Witsel','Xhaka','Shaqiri','Sommer','Oblak','Werner','Havertz','Salah','Mané','Keïta','Minamino','Sakai','Heung-min']
  }
}

// Nationality → name pool mapping for teams
export const TEAM_NATIONALITY = {
  es: 'spanish', de: 'german', it: 'italian',
  'gb-eng': 'english', fr: 'french', pt: 'portuguese',
  nl: 'dutch'
}

export function getPlayerName(cc) {
  const pool = PLAYER_NAMES[TEAM_NATIONALITY[cc] || 'other']
  const first = pool.first[Math.floor(Math.random() * pool.first.length)]
  const last = pool.last[Math.floor(Math.random() * pool.last.length)]
  return `${first} ${last}`
}

// Coach name pools
export const COACH_NAMES = [
  // Legendary-tier names (famous managers)
  { name: 'Carlo Ancelotti', tier: 'legendary', nationality: 'it' },
  { name: 'Pep Guardiola', tier: 'legendary', nationality: 'es' },
  { name: 'Jürgen Klopp', tier: 'legendary', nationality: 'de' },
  { name: 'José Mourinho', tier: 'legendary', nationality: 'pt' },
  { name: 'Diego Simeone', tier: 'legendary', nationality: 'ar' },
  { name: 'Zinedine Zidane', tier: 'legendary', nationality: 'fr' },
  // Rare tier
  { name: 'Luis Enrique', tier: 'rare', nationality: 'es' },
  { name: 'Thomas Tuchel', tier: 'rare', nationality: 'de' },
  { name: 'Antonio Conte', tier: 'rare', nationality: 'it' },
  { name: 'Mauricio Pochettino', tier: 'rare', nationality: 'ar' },
  { name: 'Brendan Rodgers', tier: 'rare', nationality: 'gb-nir' },
  { name: 'Unai Emery', tier: 'rare', nationality: 'es' },
  { name: 'Xabi Alonso', tier: 'rare', nationality: 'es' },
  { name: 'Roberto De Zerbi', tier: 'rare', nationality: 'it' },
  // Common/Uncommon pool (generic names)
  ...['Marco Rossi','Jan Müller','David Walsh','Pierre Martin','Andrei Popescu',
     'Carlos Vega','Ivan Petrov','Mikael Andersen','Stefan Kovač','Nuno Almeida',
     'Fabio Ricci','Hans Weber','James Cooper','Luca Ferrari','Miguel Santos',
     'Pablo Herrera','Robert Klein','Alex Thompson','Gianni Conti','Erik Larsen'
  ].map(n => ({ name: n, tier: Math.random() < 0.3 ? 'uncommon' : 'common', nationality: 'eu' }))
]
