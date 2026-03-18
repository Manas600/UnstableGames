import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './Home';
import Imposter from './Imposter';
import Mafia from './Mafia';
import LetterRace from './LetterRace'; // <--- ADD IMPORT
import './App.css'; 

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/imposter" element={<Imposter />} />
        <Route path="/mafia" element={<Mafia />} />
        
        <Route path="/letter-race" element={<LetterRace />} />
      </Routes>
    </Router>
  );
}

export default App;