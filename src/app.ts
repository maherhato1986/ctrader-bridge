import { runStrategy } from './modules/strategy/strategy.engine';
import { runRisk } from './modules/risk/risk.engine';
import { executeTrade } from './modules/execution/execution.service';

const signal = {
  traceId: 'test-123',
  symbol: 'XAUUSD',
  action: 'BUY',
  volume: 0.01
};

async function start() {
  console.log('🚀 SYSTEM STARTED');

  const strategyOk = runStrategy(signal);
  if (!strategyOk) {
    console.log('❌ Strategy رفضت الصفقة');
    return;
  }

  const riskOk = runRisk(signal);
  if (!riskOk) {
    console.log('❌ Risk رفض الصفقة');
    return;
  }

  await executeTrade(signal);
}

start();