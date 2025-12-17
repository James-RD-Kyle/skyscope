export function SearchBar({ value, onChange, onSearch }) {
  function handleSubmit(event) {
    event.preventDefault();
    if (typeof onSearch === "function") {
      onSearch(value);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="absolute top-4 left-1/2 z-10 w-11/12 max-w-md -translate-x-1/2"
    >
      <input
        type="search"
        placeholder="Search for an aircraft by callsign..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2 rounded-lg shadow-md border border-gray-300
                   focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </form>
  );
}
