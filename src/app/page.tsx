import Game from "@/components/Game";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <Game />
      <footer className="mt-auto px-4 py-6 text-center text-xs text-white/30">
        GMZero · GM inference on 0G Compute · saves on 0G Storage · settled on 0G Chain
      </footer>
    </div>
  );
}
