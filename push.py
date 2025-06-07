#!/usr/bin/env python3
"""
GitHub Repository Push Script

This script allows you to push files from the current directory
to a GitHub repository of your choice using the GitHub API.

Usage:
1. Run the script: python github_push.py
2. Enter your GitHub Personal Access Token (PAT) when prompted
3. Select the target repository from the list
4. The script will push your files to the selected repository

Note: This script requires the requests library.
"""

import os
import json
import base64
import getpass
import requests
from typing import List, Dict, Optional, Tuple, Any

class GitHubAPI:
    def __init__(self, token: str):
        """Initialize the GitHub API client with the given token."""
        self.token = token
        self.base_url = "https://api.github.com"
        self.headers = {
            "Authorization": f"token {self.token}",
            "Accept": "application/vnd.github.v3+json"
        }
        
    def test_authentication(self) -> Tuple[bool, Optional[str]]:
        """Test if the token is valid by fetching the user information."""
        response = requests.get(f"{self.base_url}/user", headers=self.headers)
        if response.status_code == 200:
            user_data = response.json()
            return True, user_data.get("login")
        else:
            error = response.json().get("message", "Unknown error")
            return False, error
    
    def get_user_repositories(self) -> List[Dict[str, Any]]:
        """Get a list of repositories for the authenticated user."""
        all_repos = []
        page = 1
        per_page = 100
        
        while True:
            response = requests.get(
                f"{self.base_url}/user/repos",
                headers=self.headers,
                params={"page": page, "per_page": per_page, "sort": "updated"}
            )
            
            if response.status_code != 200:
                error = response.json().get("message", "Unknown error")
                print(f"Error fetching repositories: {error}")
                break
                
            repos = response.json()
            all_repos.extend(repos)
            
            if len(repos) < per_page:
                break
                
            page += 1
            
        return all_repos
    
    def get_repository_contents(self, repo_name: str, path: str = "") -> List[Dict[str, Any]]:
        """Get the contents of a repository at the specified path."""
        url = f"{self.base_url}/repos/{repo_name}/contents/{path}"
        response = requests.get(url, headers=self.headers)
        
        if response.status_code == 200:
            return response.json()
        else:
            error = response.json().get("message", "Unknown error")
            print(f"Error fetching repository contents: {error}")
            return []
    
    def create_or_update_file(self, repo_name: str, file_path: str, local_path: str, 
                              commit_message: str, branch: str = "main") -> bool:
        """Create or update a file in the repository."""
        try:
            # Check if the file already exists in the repo
            url = f"{self.base_url}/repos/{repo_name}/contents/{file_path}"
            response = requests.get(url, headers=self.headers)
            
            # Get the file content from the local file
            with open(local_path, 'rb') as file:
                content = file.read()
            
            # Base64 encode the content
            encoded_content = base64.b64encode(content).decode('utf-8')
            
            data = {
                "message": commit_message,
                "content": encoded_content,
                "branch": branch
            }
            
            # If the file exists, we need to include the SHA for updating
            if response.status_code == 200:
                file_sha = response.json().get("sha")
                data["sha"] = file_sha
                print(f"Updating {file_path}...")
            else:
                print(f"Creating {file_path}...")
            
            # Create or update the file
            response = requests.put(url, headers=self.headers, json=data)
            
            if response.status_code in (200, 201):
                return True
            else:
                error = response.json().get("message", "Unknown error")
                print(f"Error for {file_path}: {error}")
                return False
                
        except Exception as e:
            print(f"Error processing {file_path}: {str(e)}")
            return False
    
    def create_commit(self, repo_name: str, changes: List[Dict[str, Any]], 
                      commit_message: str, branch: str = "main") -> bool:
        """Create a commit with multiple file changes using the Git Data API."""
        # Implementation would go here - this is complex and requires multiple API calls
        # For now, we'll use the simpler approach of individual file uploads
        pass


def list_local_files(directory: str, exclude_dirs: List[str] = None, 
                    exclude_extensions: List[str] = None) -> List[str]:
    """
    List all files in the directory and subdirectories, excluding specified directories and file extensions.
    Returns a list of relative paths to the files.
    """
    if exclude_dirs is None:
        exclude_dirs = ['.git', '__pycache__', '.idea', 'venv', 'env', '.vscode']
    
    if exclude_extensions is None:
        exclude_extensions = ['.pyc', '.pyo', '.pyd', '.so', '.dll', '.exe']
    
    file_paths = []
    
    for root, dirs, files in os.walk(directory):
        # Remove excluded directories
        dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.')]
        
        for file in files:
            if not any(file.endswith(ext) for ext in exclude_extensions) and not file.startswith('.'):
                rel_path = os.path.relpath(os.path.join(root, file), directory)
                file_paths.append(rel_path)
    
    return file_paths


def select_repository(repositories: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Display a list of repositories and let the user select one."""
    if not repositories:
        print("No repositories found.")
        return None
    
    print("\nAvailable repositories:")
    for i, repo in enumerate(repositories, 1):
        print(f"{i}. {repo['full_name']} ({repo['description'] or 'No description'})")
    
    while True:
        try:
            choice = int(input("\nSelect a repository (number): "))
            if 1 <= choice <= len(repositories):
                return repositories[choice - 1]
            else:
                print("Invalid choice. Please try again.")
        except ValueError:
            print("Please enter a number.")


def push_files_to_repository(github: GitHubAPI, repo: Dict[str, Any], 
                            source_dir: str, target_branch: str = "main") -> None:
    """Push all files from the source directory to the repository."""
    repo_name = repo["full_name"]
    print(f"\nPushing files to {repo_name} on branch {target_branch}...")
    
    # Get list of local files to push
    local_files = list_local_files(source_dir)
    
    # Group files by directory for more efficient processing
    directories = {}
    for file_path in local_files:
        dir_name = os.path.dirname(file_path)
        if dir_name not in directories:
            directories[dir_name] = []
        directories[dir_name].append(file_path)
    
    # Process files directory by directory
    total_files = len(local_files)
    processed = 0
    
    for dir_name, files in directories.items():
        # Ensure directory exists in the repository
        if dir_name and dir_name != ".":
            # We would need to ensure directories exist here, but GitHub API
            # automatically creates directories when files are pushed
            pass
        
        # Push each file in the directory
        for file_path in files:
            local_path = os.path.join(source_dir, file_path)
            
            # Skip large binary files
            file_size = os.path.getsize(local_path)
            if file_size > 10 * 1024 * 1024:  # Skip files > 10MB
                print(f"Skipping large file {file_path} ({file_size / 1024 / 1024:.2f} MB)")
                continue
                
            # Skip files that look like logs or generated content
            if any(keyword in file_path.lower() for keyword in ['log', 'cache', 'tmp']):
                continue
            
            try:
                # Create or update file
                success = github.create_or_update_file(
                    repo_name=repo_name,
                    file_path=file_path,
                    local_path=local_path,
                    commit_message=f"Update {file_path}",
                    branch=target_branch
                )
                
                processed += 1
                progress = (processed / total_files) * 100
                print(f"Progress: {processed}/{total_files} files ({progress:.1f}%)")
                
            except Exception as e:
                print(f"Error pushing {file_path}: {str(e)}")
    
    print(f"\nPush completed. {processed}/{total_files} files processed.")


def main():
    print("=" * 50)
    print("GitHub Repository Push Tool")
    print("=" * 50)
    print("\nThis tool will push your local files to a GitHub repository.")
    
    # Get GitHub token
    token = getpass.getpass("Enter your GitHub Personal Access Token (PAT): ")
    
    # Initialize GitHub API client
    github = GitHubAPI(token)
    
    # Test authentication
    print("\nVerifying GitHub credentials...")
    auth_success, username = github.test_authentication()
    
    if not auth_success:
        print(f"Authentication failed: {username}")
        return
    
    print(f"Authentication successful! Logged in as: {username}")
    
    # Get repositories
    print("\nFetching your repositories...")
    repositories = github.get_user_repositories()
    
    # Select repository
    repo = select_repository(repositories)
    if not repo:
        return
    
    # Confirm the operation
    source_dir = "."  # Current directory
    branch = input(f"\nEnter the target branch name (default: main): ") or "main"
    
    print(f"\nReady to push files to: {repo['full_name']}")
    print(f"Source directory: {os.path.abspath(source_dir)}")
    print(f"Target branch: {branch}")
    
    confirmation = input("\nContinue with this operation? (y/n): ").lower()
    if confirmation != 'y':
        print("Operation cancelled.")
        return
    
    # Push files
    push_files_to_repository(github, repo, source_dir, branch)
    

if __name__ == "__main__":
    main()
