export default function Bridge({ planks, goal }) {
  return (
    <div className="my-6">
      <div className="flex items-end justify-center gap-1">
        <div className="text-4xl">🏠</div>
        {Array.from({ length: goal }).map((_, i) => (
          <div
            key={i}
            className={`h-6 w-10 md:w-14 rounded transition-all duration-700 ${
              i < planks ? 'bg-amber-600 scale-100 shadow-lg' : 'bg-slate-300/60 scale-90 border border-dashed border-slate-400'
            }`}
          />
        ))}
        <div className="text-4xl">🏡</div>
      </div>
      <div className="mt-3 flex justify-center gap-24 text-sm font-medium text-slate-600">
        <span>Then</span>
        <span>Now</span>
      </div>
      <p className="text-center mt-2 font-semibold">{planks} / {goal} planks built</p>
    </div>
  )
}
