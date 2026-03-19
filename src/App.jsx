import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './Home';
import Imposter from './Imposter';
import Mafia from './Mafia';
import LetterRace from './LetterRace';
import WordImposter from './WordImposter'; // <--- ADD THIS IMPORT
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/imposter" element={<Imposter />} />
        <Route path="/mafia" element={<Mafia />} />
        <Route path="/letter-race" element={<LetterRace />} />

        <Route path="/word-imposter" element={<WordImposter />} />
      </Routes>
    </Router>
  );
}

export default App;