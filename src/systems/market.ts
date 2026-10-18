import { BALANCE } from '../data/balance';
import { RESOURCE_NAMES } from '../data/defs';
import type { Sim } from '../core/sim';
import type { ResourceKind } from '../entities/types';

// Mercado: compra e venda de lotes de recursos por ouro. Cada troca piora o preço daquele recurso
// (vender muito barateia, comprar muito encarece), e ele volta ao normal aos poucos, a cada hora.

const MK = BALANCE.market;

export const TRADEABLE = Object.keys(MK.basePrice) as ResourceKind[];

export function hasMarket(sim: Sim): boolean {
  return sim.state.buildings.some((b) => b.kind === 'market' && b.built);
}

// Ouro pago (compra) ou recebido (venda) por um lote, agora.
export function lotPrice(sim: Sim, kind: ResourceKind, side: 'buy' | 'sell'): number {
  const factor = sim.state.market[kind] ?? 1;
  const base = MK.basePrice[kind] * factor;
  return Math.max(1, Math.round(base * (side === 'buy' ? MK.buyFactor : MK.sellFactor)));
}

export function trade(sim: Sim, kind: ResourceKind, side: 'buy' | 'sell'): string | null {
  if (!hasMarket(sim)) return 'É preciso um Mercado.';
  if (!TRADEABLE.includes(kind)) return 'Isto não se negocia.';
  const r = sim.state.resources;
  const price = lotPrice(sim, kind, side);
  if (side === 'sell') {
    if (r[kind] < MK.lot) return `É preciso ter ${MK.lot} de ${RESOURCE_NAMES[kind].toLowerCase()}.`;
    r[kind] -= MK.lot;
    r.gold += price;
  } else {
    if (r.gold < price) return `É preciso ${price} de ouro.`;
    r.gold -= price;
    r[kind] += MK.lot;
  }
  const f = (sim.state.market[kind] ?? 1) * (side === 'buy' ? 1 + MK.step : 1 / (1 + MK.step));
  sim.state.market[kind] = Math.min(MK.maxFactor, Math.max(MK.minFactor, f));
  return null;
}

// A cada hora de jogo, os preços voltam um pouco ao normal.
export function recoverPrices(sim: Sim): void {
  for (const k of TRADEABLE) {
    const f = sim.state.market[k] ?? 1;
    const step = MK.recoverPerHour;
    sim.state.market[k] = f > 1 ? Math.max(1, f - step) : Math.min(1, f + step);
  }
}
