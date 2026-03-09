/** Shared maze generation for Tom & Jerry multiplayer (GameLobby and MultiplayerGame reset). */
export const GRID_SIZE = 10;
export const WALL_DENSITY = 0.1;

export type CellType = "empty" | "wall";

function hasPath(grid: CellType[][], size: number, blockCell: { x: number; y: number } | null = null): boolean {
  const visited = new Set<string>();
  const queue: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  visited.add("0,0");
  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    if (x === size - 1 && y === size - 1) return true;
    const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
    for (const d of dirs) {
      const nx = x + d.x, ny = y + d.y;
      const key = `${nx},${ny}`;
      const isBlocked = blockCell && blockCell.x === nx && blockCell.y === ny;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size && !visited.has(key) && grid[ny][nx] !== "wall" && !isBlocked) {
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return false;
}

function carveGuaranteedPath(grid: CellType[][], size: number): void {
  const tomX = size - 1, tomY = 0;
  for (let x = 0; x <= size - 2; x++) grid[0][x] = "empty";
  for (let y = 0; y < size; y++) grid[y][size - 2] = "empty";
  for (let y = 1; y < size; y++) grid[y][size - 1] = "empty";
  grid[size - 1][size - 1] = "empty";
  grid[tomY][tomX] = "empty";
}

export function generateMaze(): CellType[][] {
  const grid: CellType[][] = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => "empty")
  );
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (Math.random() < WALL_DENSITY) grid[y][x] = "wall";
    }
  }
  grid[0][0] = "empty"; grid[0][1] = "empty"; grid[1][0] = "empty";
  grid[GRID_SIZE - 1][GRID_SIZE - 1] = "empty";
  grid[GRID_SIZE - 1][GRID_SIZE - 2] = "empty";
  grid[GRID_SIZE - 2][GRID_SIZE - 1] = "empty";
  const tomStart = { x: GRID_SIZE - 1, y: 0 };
  grid[tomStart.y][tomStart.x] = "empty";
  grid[0][GRID_SIZE - 2] = "empty";
  grid[1][GRID_SIZE - 1] = "empty";
  let attempts = 0;
  const maxAttempts = 120;
  while (!hasPath(grid, GRID_SIZE, tomStart) && attempts < maxAttempts) {
    const wy = Math.floor(Math.random() * GRID_SIZE);
    const wx = Math.floor(Math.random() * GRID_SIZE);
    if (grid[wy][wx] === "wall") { grid[wy][wx] = "empty"; attempts++; }
  }
  if (!hasPath(grid, GRID_SIZE, tomStart)) carveGuaranteedPath(grid, GRID_SIZE);
  return grid;
}
