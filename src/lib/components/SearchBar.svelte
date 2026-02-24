<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();
  
  let searchQuery = '';

  function handleInput(event) {
    searchQuery = event.target.value;
    dispatch('search', searchQuery);
  }

  function clearSearch() {
    searchQuery = '';
    dispatch('search', '');
  }
</script>

<div class="search-bar">
  <div class="input-group">
    <span class="input-group-text">🔍</span>
    <input 
      type="text" 
      class="form-control" 
      placeholder="Search by title or artist..." 
      bind:value={searchQuery}
      on:input={handleInput}
    />
    {#if searchQuery}
      <button class="btn btn-outline-secondary" type="button" on:click={clearSearch}>
        ✕
      </button>
    {/if}
  </div>
</div>

<style>
  .search-bar {
    max-width: 500px;
  }
</style>
