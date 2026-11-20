import {RegistrySnapshot} from './scanner';

/**
 * Formats and prints the scan result
 */
export function printScanResult(snapshot: RegistrySnapshot): void {
  // Get contexts from the snapshot (these are PascalCase)
  const contexts = Array.from(snapshot.contexts).sort();
  
  if (contexts.length === 0) {
    console.log('No commands or queries found in domain directory.');
    return;
  }
  
  for (const context of contexts) {
    // Format context name for display (PascalCase to "Context Name")
    const contextName = formatContextName(context);
    
    console.log(`\n${contextName}`);
    console.log('─'.repeat(contextName.length));
    
    // Commands
    const contextCommands = Array.from(snapshot.commands).filter(cmd => cmd.startsWith(context + '.')).sort();
    if (contextCommands.length > 0) {
      console.log('\nCommands:');
      for (const command of contextCommands) {
        console.log(`  • ${command}`);
      }
    } else {
      console.log('\nCommands: (none)');
    }
    
    // Queries
    const contextQueries = Array.from(snapshot.queries).filter(q => q.startsWith(context + '.')).sort();
    if (contextQueries.length > 0) {
      console.log('\nQueries:');
      for (const query of contextQueries) {
        console.log(`  • ${query}`);
      }
    } else {
      console.log('\nQueries: (none)');
    }
  }
  
  console.log('');
}

/**
 * Formats context name for display (e.g., "TaskManagement" -> "Task Management")
 */
function formatContextName(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2');
}
