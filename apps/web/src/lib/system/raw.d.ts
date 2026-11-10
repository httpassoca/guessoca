/** `import texto from './arquivo.txt?raw'` (Vite): o conteúdo do arquivo como string. */
declare module '*.txt?raw' {
  const text: string;
  export default text;
}
