/**
 * Mock implementation of ChangeSource for testing
 */

import { ChangeSource, ChangeEvent } from "../../src/interfaces.js";

export class MockChangeSource implements ChangeSource {
  private fileContents = new Map<string, string>();
  private changeEvents: ChangeEvent[] = [];
  private watchedPaths: string[] = [];

  async *watch(paths: string[]): AsyncIterable<ChangeEvent> {
    this.watchedPaths = [...paths];
    
    // Yield any queued events
    while (this.changeEvents.length > 0) {
      const event = this.changeEvents.shift();
      if (event) {
        yield event;
      }
    }
    
    // Keep the iterator open for future events
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 100));
      while (this.changeEvents.length > 0) {
        const event = this.changeEvents.shift();
        if (event) {
          yield event;
        }
      }
    }
  }

  async readFile(path: string): Promise<string> {
    const content = this.fileContents.get(path);
    if (content === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.fileContents.set(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return this.fileContents.has(path);
  }

  async copy(src: string, dest: string): Promise<void> {
    const content = await this.readFile(src);
    await this.writeFile(dest, content);
  }

  async copyFile(src: string, dest: string): Promise<void> {
    const content = await this.readFile(src);
    await this.writeFile(dest, content);
  }

  // Test helper methods
  setFileContent(path: string, content: string): void {
    this.fileContents.set(path, content);
  }

  triggerChange(event: ChangeEvent): void {
    this.changeEvents.push(event);
  }

  getWatchedPaths(): string[] {
    return [...this.watchedPaths];
  }
}