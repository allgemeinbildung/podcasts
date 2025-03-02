# Description: This script extracts the podcast intro and outro files from the subdirectories of the root folder and copies them to the destination folder.
# The intro and outro files are renamed using the prefix extracted from the subdirectory name.
import os
import shutil
import re

def main():
    # Ask user for the root folder path
    root_folder = input("Enter the root folder path: ").strip()
    
    # Destination folder where the files will be saved
    dest_folder = r"D:\OneDrive - bbw.ch\+GIT\audio\podcasts\fobizz"
    
    # Ensure the destination folder exists
    if not os.path.exists(dest_folder):
        os.makedirs(dest_folder)
    
    # Walk through all subdirectories of the root folder
    for dirpath, dirnames, filenames in os.walk(root_folder):
        # Check if both pod_intro.md and pod_outro.md are present in the current folder
        if "pod_intro.md" in filenames and "pod_outro.md" in filenames:
            # Extract the folder name (last part of the current directory path)
            folder_name = os.path.basename(dirpath)
            # Use a regex to extract the prefix in the form of x.x (e.g., 15.1)
            match = re.match(r"(\d+\.\d+)", folder_name)
            if match:
                prefix = match.group(1)
            else:
                # If the folder name doesn't start with the expected pattern, skip it.
                print(f"Skipping folder '{dirpath}' (naming pattern not recognized).")
                continue
            
            # Construct the new file names
            new_intro_name = f"{prefix}_i.md"
            new_outro_name = f"{prefix}_o.md"
            
            # Full paths for the source files
            source_intro = os.path.join(dirpath, "pod_intro.md")
            source_outro = os.path.join(dirpath, "pod_outro.md")
            
            # Full paths for the destination files
            dest_intro = os.path.join(dest_folder, new_intro_name)
            dest_outro = os.path.join(dest_folder, new_outro_name)
            
            # Copy and overwrite the files in the destination folder
            shutil.copy2(source_intro, dest_intro)
            shutil.copy2(source_outro, dest_outro)
            
            print(f"Copied files from '{dirpath}': '{new_intro_name}', '{new_outro_name}'")

if __name__ == "__main__":
    main()
