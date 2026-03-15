import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './Home';
import Imposter from './Imposter';
import './App.css'; 

function App() {
  return (
    <Router>
      <Routes>
        {/* The Master Hub */}
        <Route path="/" element={<Home />} />
        
        {/* The Games */}
        <Route path="/imposter" element={<Imposter />} />
      </Routes>
    </Router>
  );
}

export default App;