"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { useDeviceStore } from "@/store/device.store";
import { wsService } from "@/services/websocket-native.service";
import { Contact } from "@/types";
import {
  User,
  Phone,
  Mail,
  Search,
  Edit,
  Trash2,
  Plus,
  Download,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

export default function ContactsPage() {
  const { selectedDevice, isInitializing } = useDeviceStore();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  useEffect(() => {
    // Only load contacts after initialization is complete and device is selected
    if (!isInitializing && selectedDevice) {
      loadContacts();
    }
  }, [isInitializing, selectedDevice]);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const contactList = await wsService.getContacts();
      setContacts(contactList.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error("Failed to load contacts:", error);
      toast.error("Failed to load contacts");
    } finally {
      setLoading(false);
    }
  };

  const handleContactSelect = (contactId: string) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(contactId)) {
      newSelected.delete(contactId);
    } else {
      newSelected.add(contactId);
    }
    setSelectedContacts(newSelected);
  };

  const handleDeleteContacts = async () => {
    if (selectedContacts.size === 0) {
      toast.error("No contacts selected");
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedContacts.size} contacts?`);
    if (!confirmed) return;

    for (const contactId of selectedContacts) {
      try {
        await wsService.sendCommand("contact:delete", { id: contactId });
        setContacts((prev) => prev.filter((c) => c.id !== contactId));
        toast.success("Contacts deleted");
      } catch (error) {
        toast.error("Failed to delete contacts");
      }
    }
    setSelectedContacts(new Set());
  };

  const handleExportContacts = async () => {
    if (selectedContacts.size === 0) {
      toast.error("No contacts selected");
      return;
    }

    const selectedContactsList = contacts.filter((c) =>
      selectedContacts.has(c.id)
    );

    const vCardData = selectedContactsList.map((contact) => {
      let vcard = "BEGIN:VCARD\nVERSION:3.0\n";
      vcard += `FN:${contact.name}\n`;
      contact.phoneNumbers.forEach((phone) => {
        vcard += `TEL:${phone}\n`;
      });
      contact.emails.forEach((email) => {
        vcard += `EMAIL:${email}\n`;
      });
      vcard += "END:VCARD\n";
      return vcard;
    }).join("\n");

    const blob = new Blob([vCardData], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts.vcf";
    a.click();
    URL.revokeObjectURL(url);

    toast.success(`Exported ${selectedContacts.size} contacts`);
  };

  const filteredContacts = contacts.filter(
    (contact) =>
      contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.phoneNumbers.some((phone) =>
        phone.includes(searchQuery)
      ) ||
      contact.emails.some((email) =>
        email.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  // Group contacts by first letter
  const groupedContacts = filteredContacts.reduce((acc, contact) => {
    const firstLetter = contact.name[0]?.toUpperCase() || "#";
    if (!acc[firstLetter]) {
      acc[firstLetter] = [];
    }
    acc[firstLetter].push(contact);
    return acc;
  }, {} as Record<string, Contact[]>);

  const sortedGroups = Object.keys(groupedContacts).sort();

  if (!selectedDevice) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <User className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No Device Connected</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Connect a device to manage contacts
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b p-6">
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {contacts.length} contacts
          </p>
        </div>

        {/* Toolbar */}
        <div className="border-b p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedContacts.size > 0 ? (
                <>
                  <span className="text-sm font-medium">
                    {selectedContacts.size} selected
                  </span>
                  <button
                    onClick={handleExportContacts}
                    className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    <Download className="h-4 w-4" />
                    Export
                  </button>
                  <button
                    onClick={handleDeleteContacts}
                    className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowAddDialog(true)}
                  className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
                >
                  <UserPlus className="h-4 w-4" />
                  Add Contact
                </button>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-64 rounded-lg border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Contacts List */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                <p className="mt-4 text-sm text-muted-foreground">
                  Loading contacts...
                </p>
              </div>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <User className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-sm text-muted-foreground">
                  No contacts found
                </p>
              </div>
            </div>
          ) : (
            <div>
              {sortedGroups.map((letter) => (
                <div key={letter}>
                  <div className="sticky top-0 bg-gray-50 px-6 py-2 text-sm font-semibold text-muted-foreground">
                    {letter}
                  </div>
                  <div className="divide-y">
                    {groupedContacts[letter].map((contact) => (
                      <div
                        key={contact.id}
                        className={cn(
                          "flex items-center gap-4 px-6 py-3",
                          "cursor-pointer hover:bg-accent/50 transition-colors",
                          selectedContacts.has(contact.id) && "bg-accent"
                        )}
                        onClick={() => handleContactSelect(contact.id)}
                      >
                        {/* Avatar */}
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                          {contact.avatar ? (
                            <img
                              src={contact.avatar}
                              alt={contact.name}
                              className="h-full w-full rounded-full object-cover"
                            />
                          ) : (
                            <span className="text-lg font-semibold">
                              {contact.name[0]?.toUpperCase()}
                            </span>
                          )}
                        </div>

                        {/* Contact Info */}
                        <div className="flex-1">
                          <p className="font-medium">{contact.name}</p>
                          {contact.phoneNumbers.length > 0 && (
                            <div className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {contact.phoneNumbers[0]}
                              {contact.phoneNumbers.length > 1 && (
                                <span className="text-xs">
                                  (+{contact.phoneNumbers.length - 1})
                                </span>
                              )}
                            </div>
                          )}
                          {contact.emails.length > 0 && (
                            <div className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {contact.emails[0]}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingContact(contact);
                          }}
                          className="p-1.5 rounded hover:bg-accent"
                        >
                          <Edit className="h-4 w-4 text-muted-foreground" />
                        </button>

                        {/* Selection Checkbox */}
                        <div
                          className={cn(
                            "h-5 w-5 rounded border-2",
                            selectedContacts.has(contact.id)
                              ? "border-primary bg-primary"
                              : "border-gray-300"
                          )}
                        >
                          {selectedContacts.has(contact.id) && (
                            <svg
                              className="h-full w-full text-white"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alphabet Index */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <div className="flex flex-col gap-0.5 text-xs">
            {"ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("").map((letter) => (
              <button
                key={letter}
                onClick={() => {
                  const element = document.querySelector(
                    `[data-letter="${letter}"]`
                  );
                  element?.scrollIntoView({ behavior: "smooth" });
                }}
                className={cn(
                  "h-4 w-4 rounded text-center",
                  "hover:bg-accent hover:text-accent-foreground",
                  groupedContacts[letter] && "font-semibold"
                )}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}