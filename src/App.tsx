import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import PumpItSim from './games/pumpit/PumpItSim'
import SolPong from './games/solpong/SolPong'

// Launch time: 7 PM EST on Feb 2, 2026
// EST = UTC-5, so 7 PM EST = 00:00 UTC on Feb 3
const LAUNCH_TIME = new Date('2026-02-03T00:00:00Z').getTime();

function LaunchCountdown() {
  const [timeLeft, setTimeLeft] = useState(LAUNCH_TIME - Date.now());
  
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(LAUNCH_TIME - Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  
  const hours = Math.floor(timeLeft / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
  
  return (
    <div 
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0d0e12 0%, #15161d 50%, #1a1b23 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'DynaPuff', sans-serif",
        color: '#fff',
        textAlign: 'center',
        padding: 20,
      }}
    >
      <div style={{ fontSize: '4rem', marginBottom: 20 }}>🎰</div>
      <h1 
        style={{ 
          fontSize: 'clamp(2rem, 8vw, 4rem)', 
          fontWeight: 700,
          background: 'linear-gradient(to right, #3B82F6, #00FFA3)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: 10,
        }}
      >
        str8.fun
      </h1>
      <p style={{ fontSize: 'clamp(1rem, 3vw, 1.5rem)', color: 'rgba(255,255,255,0.7)', marginBottom: 40 }}>
        Launching Soon
      </p>
      
      <div 
        style={{ 
          display: 'flex', 
          gap: 'clamp(10px, 4vw, 30px)',
          marginBottom: 40,
        }}
      >
        {[
          { value: hours, label: 'HOURS' },
          { value: minutes, label: 'MINS' },
          { value: seconds, label: 'SECS' },
        ].map(({ value, label }) => (
          <div 
            key={label}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '2px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 16,
              padding: 'clamp(15px, 4vw, 30px)',
              minWidth: 'clamp(70px, 15vw, 120px)',
            }}
          >
            <div 
              style={{ 
                fontSize: 'clamp(2rem, 8vw, 4rem)', 
                fontWeight: 700,
                color: '#00FFA3',
                textShadow: '0 0 20px rgba(0, 255, 163, 0.5)',
              }}
            >
              {Math.max(0, value).toString().padStart(2, '0')}
            </div>
            <div style={{ fontSize: 'clamp(0.6rem, 2vw, 0.9rem)', color: 'rgba(255,255,255,0.5)', marginTop: 5 }}>
              {label}
            </div>
          </div>
        ))}
      </div>
      
      <p style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)', color: 'rgba(255,255,255,0.6)' }}>
        7:00 PM EST • February 2, 2026
      </p>
    </div>
  );
}

function App() {
  const [isLaunched, setIsLaunched] = useState(Date.now() >= LAUNCH_TIME);
  
  useEffect(() => {
    if (!isLaunched) {
      const timer = setInterval(() => {
        if (Date.now() >= LAUNCH_TIME) {
          setIsLaunched(true);
          clearInterval(timer);
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isLaunched]);
  
  if (!isLaunched) {
    return <LaunchCountdown />;
  }
  
  return (
    <Routes>
      <Route path="/" element={<PumpItSim />} />
      <Route path="/solpong" element={<SolPong />} />
    </Routes>
  )
}

export default App
