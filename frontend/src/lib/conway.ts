export const arrsize = 200;

const clamplr = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

// 1 = alive, 0 = dead, 2 = dying, 3 = dying
export const stepConway = (cellvals: number[]): number[] => {
  let cellsum = 0;
  return Array.from(Array(arrsize * arrsize).keys()).map((index) => {
    cellsum = 0;
    const currcell = cellvals[index];
    if (currcell === 2) {
      return 3;
    }
    if (currcell === 3) {
      return 0;
    }

    for (let x = -1; x < 2; x += 1) {
      for (let y = -1; y < 2; y += 1) {
        if (!(x === 0 && y === 0)) {
          const neighbor = cellvals[clamplr(index + x + arrsize * y, 0, cellvals.length - 1)];
          if (neighbor === 1) {
            cellsum += 1;
          }
        }
      }
    }

    if (currcell === 0) {
      return cellsum === 2 ? 1 : 0;
    }

    return cellsum < 3 || cellsum > 5 ? 2 : 1;
  });
};

export const createRandomConwayGrid = (): number[] =>
  Array.from(Array(arrsize * arrsize).keys()).map(() => Math.floor(Math.random() * 2));

export const shuffleConwayGrid = (): number[] =>
  Array.from(Array(arrsize * arrsize).keys()).map(() => Math.floor(Math.random() * 1.5));
