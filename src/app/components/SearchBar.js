export function SearchBar({ value, onChange, onSearch }) {
  function handleSubmit(event) {
    event.preventDefault();
    onSearch(value.trim());
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex absolute top-4 left-1/2 -translate-x-1/2 z-10 w-11/12 max-w-md"
    >
      <input
        type="search"
        placeholder="Search for flights"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="text-center w-full px-4 py-2 rounded-lg shadow-md border border-gray-300
                   focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </form>
  );
}