# PumpIt Integration Guide

## File Overview

Your trading game consists of **3 main files**:

| File | Purpose |
|------|---------|
| `RugsChart.tsx` | **The Chart** - Canvas-based 60fps candlestick chart with multiplier overlay |
| `TradeDeck.tsx` | **Trading Controls** - Buy/Sell buttons with amount input |
| `PumpItSim.tsx` | **Game Logic** - Price simulation, candle generation, trade handling |

---

## 1. RugsChart.tsx (The Chart)

**Location:** `src/components/pumpit/RugsChart.tsx`

**What it does:** Renders a real-time candlestick chart using HTML5 Canvas at 60fps.

### Props Required:
```tsx
interface RugsChartProps {
  data: CandleData[];      // Array of candle objects
  currentPrice: number;    // Current live price
  startPrice: number;      // Starting price (for multiplier calculation)
}

interface CandleData {
  open: number;   // Price at candle start
  high: number;   // Highest price during candle
  low: number;    // Lowest price during candle
  close: number;  // Price at candle end (current for live candle)
}
```

### Usage:
```tsx
<RugsChart 
  data={candlesArray} 
  currentPrice={1.25} 
  startPrice={1.0} 
/>
```

### Key Constants to Customize:
```tsx
CHART_HEIGHT = 320       // Chart height in pixels
FIXED_CANDLE_COUNT = 60  // Number of candle slots displayed
MIN_RANGE_MULTIPLIER = 0.3  // Minimum zoom (0.7x to 1.3x visible)
COLOR_BG = '#0a0c10'     // Background color
COLOR_GREEN = '#00FF7F'  // Pump candle color
COLOR_RED = '#FF3B3B'    // Dump candle color
```

---

## 2. TradeDeck.tsx (Trading Controls)

**Location:** `src/components/pumpit/TradeDeck.tsx`

**What it does:** Renders the buy/sell UI with amount input and quick-select buttons.

### Props Required:
```tsx
interface TradeDeckProps {
  balance: number;           // User's available balance
  currentPrice: number;      // Current price (for calculations)
  onBuy: (amount: number) => void;   // Called when BUY clicked
  onSell: (amount: number) => void;  // Called when SELL clicked
}
```

### Usage:
```tsx
<TradeDeck
  balance={10.0}
  currentPrice={1.25}
  onBuy={(amount) => console.log('Buy', amount)}
  onSell={(amount) => console.log('Sell', amount)}
/>
```

### Customizable Elements:
- Quick add buttons: `+0.001`, `+0.01`, `+0.1`, `+1`
- Multipliers: `1/2`, `2X`, `MAX`
- Percentages: `10%`, `25%`, `50%`, `100%`
- Button colors and styling (Tailwind classes)

---

## 3. PumpItSim.tsx (Game Logic)

**Location:** `src/components/pumpit/PumpItSim.tsx`

**What it does:** The main game controller. Manages price simulation, candle generation, and trade execution.

### Key Constants to Customize:
```tsx
TICK_INTERVAL = 250       // Main game tick (ms) - how often major price updates happen
TICKS_PER_CANDLE = 5      // Ticks before new candle (250ms × 5 = 1.25s candles)
IDLE_VOLATILITY = 0.001   // Random price movement per tick (0.1%)
PUMP_IMPACT = 0.08        // Price increase per 0.1 SOL bought (8%)
DUMP_IMPACT = 0.06        // Price decrease per 0.1 SOL sold (6%)
INITIAL_PRICE = 1.0       // Starting price
INITIAL_BALANCE = 10.0    // Starting balance
```

### Game Loop Explained:
1. **60fps Animation Loop** - Micro price movements for smooth visuals
2. **Main Tick (250ms)** - Bigger random walk + applies trade impacts
3. **Candle Generation** - New candle every 5 ticks

---

## Integration Steps

### Step 1: Install Dependencies
```bash
npm install react react-dom
npm install -D @types/react @types/react-dom typescript
```

### Step 2: Copy the 3 files to your project
- `RugsChart.tsx`
- `TradeDeck.tsx`
- `PumpItSim.tsx`

### Step 3: Import and use
```tsx
import PumpItSim from './components/pumpit/PumpItSim';

function App() {
  return <PumpItSim />;
}
```

### Step 4: Or use components separately
```tsx
import RugsChart from './components/pumpit/RugsChart';
import TradeDeck from './components/pumpit/TradeDeck';

function MyPage() {
  const [candles, setCandles] = useState([]);
  const [price, setPrice] = useState(1.0);
  
  // Your own game logic here...
  
  return (
    <div>
      <RugsChart data={candles} currentPrice={price} startPrice={1.0} />
      <TradeDeck 
        balance={10} 
        currentPrice={price}
        onBuy={handleBuy} 
        onSell={handleSell} 
      />
    </div>
  );
}
```

---

## Connecting to Real Backend

Replace the simulation logic in `PumpItSim.tsx` with your API calls:

```tsx
// Instead of local price simulation:
useEffect(() => {
  const ws = new WebSocket('wss://your-api.com/price');
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    setPrice(data.price);
    setCandles(data.candles);
  };
  
  return () => ws.close();
}, []);

// Instead of local trade handlers:
const handleBuy = async (amount: number) => {
  const response = await fetch('/api/trade', {
    method: 'POST',
    body: JSON.stringify({ type: 'buy', amount })
  });
  // Handle response...
};
```

---

## CSS Requirements

The components use Tailwind CSS classes. If you're not using Tailwind:
1. Install Tailwind CSS, OR
2. Replace Tailwind classes with your own CSS

Key colors used:
- Background: `#080a0e`, `#0e1016`, `#1a1d24`
- Green: `#00FF7F`, `#00C853`
- Red: `#FF3B3B`
- Text: `#fff`, `rgba(255,255,255,0.4)`
