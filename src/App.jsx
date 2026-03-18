import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './Home';
import Imposter from './Imposter';
import Mafia from './Mafia'; // <--- ADD THIS IMPORT
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/imposter" element={<Imposter />} />

        {/* ADD THIS ROUTE */}
        <Route path="/mafia" element={<Mafia />} />
      </Routes>
    </Router>
  );
}

export default App;