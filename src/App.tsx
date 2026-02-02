import { Routes, Route } from 'react-router-dom'
import PumpItSim from './games/pumpit/PumpItSim'
import SolPong from './games/solpong/SolPong'

function App() {
  return (
    <Routes>
      <Route path="/" element={<PumpItSim />} />
      <Route path="/solpong" element={<SolPong />} />
    </Routes>
  )
}

export default App
