import { Link } from 'react-router-dom';

function Home() {
  // A simple array of our games. You can easily add Mafia here later!
  const games = [
    { 
      id: 'imposter', 
      name: 'Who is the Imposter?', 
      desc: 'Find the liar among you before it is too late.', 
      icon: '🦇',
      active: true
    },
    { 
      id: 'mafia', 
      name: 'Mafia (Coming Soon)', 
      desc: 'The classic game of deception and survival.', 
      icon: '🕴️',
      active: false
    },
    { 
      id: 'draw', 
      name: 'Drawful (Coming Soon)', 
      desc: 'Terrible drawings, hilarious guesses.', 
      icon: '🎨',
      active: false
    }
  ];

  return (
    <div className="batman-container" style={{ maxWidth: '800px' }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '10px' }}>Wayne Party Hub</h1>
      <p style={{ marginBottom: '40px', fontSize: '1.2rem' }}>Select a protocol to initiate...</p>
      
      <div className="game-grid">
        {games.map(game => (
          game.active ? (
            <Link to={`/${game.id}`} key={game.id} className="game-card active-card">
              <div className="card-icon">{game.icon}</div>
              <h2>{game.name}</h2>
              <p>{game.desc}</p>
              <div className="play-btn">Initialize</div>
            </Link>
          ) : (
            <div key={game.id} className="game-card locked-card">
              <div className="card-icon">{game.icon}</div>
              <h2>{game.name}</h2>
              <p>{game.desc}</p>
              <div className="locked-btn">Locked</div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

export default Home;