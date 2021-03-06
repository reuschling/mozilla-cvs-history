# 
# ***** BEGIN LICENSE BLOCK *****
# Version: MPL 1.1/GPL 2.0/LGPL 2.1
#
# The contents of this file are subject to the Mozilla Public License Version
# 1.1 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
#
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
# for the specific language governing rights and limitations under the
# License.
#
# The Original Code is the Netscape security libraries.
#
# The Initial Developer of the Original Code is
# Netscape Communications Corporation.
# Portions created by the Initial Developer are Copyright (C) 1994-2000
# the Initial Developer. All Rights Reserved.
#
# Contributor(s):
#
# Alternatively, the contents of this file may be used under the terms of
# either the GNU General Public License Version 2 or later (the "GPL"), or
# the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
# in which case the provisions of the GPL or the LGPL are applicable instead
# of those above. If you wish to allow use of your version of this file only
# under the terms of either the GPL or the LGPL, and not to allow others to
# use your version of this file under the terms of the MPL, indicate your
# decision by deleting the provisions above and replace them with the notice
# and other provisions required by the GPL or the LGPL. If you do not delete
# the provisions above, a recipient may use your version of this file under
# the terms of any one of the MPL, the GPL or the LGPL.
#
# ***** END LICENSE BLOCK *****
CONFIG_CVS_ID = "@(#) $RCSfile: config.mk,v $ $Revision: 1.1 $ $Date: 2005-11-04 02:05:04 $"

#
#  Override TARGETS variable so that only shared libraries
#  are specifed as dependencies within rules.mk.
#

TARGETS        = $(SHARED_LIBRARY)
LIBRARY        =
IMPORT_LIBRARY =
PROGRAM        =

ifeq (,$(filter-out WIN%,$(OS_TARGET)))
    SHARED_LIBRARY = $(OBJDIR)/$(DLL_PREFIX)$(LIBRARY_NAME)$(LIBRARY_VERSION).$(DLL_SUFFIX)
    RES = $(OBJDIR)/$(LIBRARY_NAME).res
    RESNAME = $(LIBRARY_NAME).rc
endif

ifdef BUILD_IDG
    DEFINES += -DNSSDEBUG
endif

#
# To create a loadable module on Darwin, we must use -bundle.
#
ifeq ($(OS_TARGET),Darwin)
DSO_LDOPTS = -bundle
endif

ifeq ($(OS_TARGET),SunOS)
# The -R '$ORIGIN' linker option instructs this library to search for its
# dependencies in the same directory where it resides.
MKSHLIB += -R '$$ORIGIN'
endif

